<?php
/**
 * Same-domain proxy for ERP Experts Admin Lite.
 *
 * The browser calls /qc-api/... on erpexperts.co.uk. This proxy forwards the
 * request to the Qualify Canvas API without exposing any admin secrets in the
 * website bundle. Auth is still handled by the Qualify Canvas session cookie.
 */

$localConfig = qualifyCanvasProxyConfig();
$apiBase = getenv('QUALIFY_CANVAS_API_BASE') ?: ($localConfig['apiBase'] ?? 'https://sentinel.artifexa.co.uk/qualify-canvas-api/api');
$sessionCookieName = getenv('QUALIFY_CANVAS_SESSION_COOKIE_NAME') ?: ($localConfig['sessionCookieName'] ?? 'qc_session');
$upstreamProxyToken = getenv('QUALIFY_CANVAS_UPSTREAM_PROXY_TOKEN') ?: ($localConfig['upstreamProxyToken'] ?? '');
$path = isset($_GET['path']) ? trim((string) $_GET['path'], '/') : '';
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, x-workspace-id');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

if ($method === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if (!isAllowedQualifyCanvasPath($path, $method)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Qualify Canvas proxy path is not allowed.']);
    exit;
}

$query = $_SERVER['QUERY_STRING'] ?? '';
parse_str($query, $queryParams);
unset($queryParams['path']);
$target = qualifyCanvasProxyTarget($path);
if (!empty($queryParams)) {
    $target .= '?' . http_build_query($queryParams);
}

$curl = curl_init($target);
$body = file_get_contents('php://input');
$requestHeaders = qualifyCanvasProxyHeaders();

curl_setopt_array($curl, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HEADER => true,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_TIMEOUT => 30,
    CURLOPT_HTTPHEADER => $requestHeaders,
]);

if (in_array($method, ['POST', 'PATCH', 'PUT', 'DELETE'], true)) {
    curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
}

$response = curl_exec($curl);
if ($response === false) {
    $error = curl_error($curl);
    curl_close($curl);
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Qualify Canvas API is unavailable.', 'detail' => $error]);
    exit;
}

$status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$headerSize = curl_getinfo($curl, CURLINFO_HEADER_SIZE);
$responseHeaders = substr($response, 0, $headerSize);
$responseBody = substr($response, $headerSize);
curl_close($curl);

http_response_code($status);
foreach (explode("\n", $responseHeaders) as $headerLine) {
    $headerLine = trim($headerLine);
    if ($headerLine === '' || strpos($headerLine, ':') === false) {
        continue;
    }

    [$name] = explode(':', $headerLine, 2);
    $normalisedName = strtolower(trim($name));
    if (in_array($normalisedName, [
        'content-length',
        'content-encoding',
        'transfer-encoding',
        'connection',
        'access-control-allow-origin',
        'access-control-allow-credentials',
    ], true)) {
        continue;
    }

    $replace = $normalisedName !== 'set-cookie';
    header($headerLine, $replace);
}

echo $responseBody;

function qualifyCanvasProxyHeaders(): array
{
    $headers = [
        'Accept: application/json',
    ];

    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if ($contentType !== '') {
        $headers[] = 'Content-Type: ' . $contentType;
    }

    $workspaceId = $_SERVER['HTTP_X_WORKSPACE_ID'] ?? '';
    if ($workspaceId !== '') {
        $headers[] = 'x-workspace-id: ' . $workspaceId;
    }

    $proxyToken = qualifyCanvasProxyToken();
    if ($proxyToken !== '') {
        $headers[] = 'x-qualify-canvas-proxy-token: ' . $proxyToken;
    }

    $cookie = qualifyCanvasSessionCookieHeader();
    if ($cookie !== '') {
        $headers[] = 'Cookie: ' . $cookie;
    }

    return $headers;
}

function qualifyCanvasProxyConfig(): array
{
    $configPath = __DIR__ . '/qualify-canvas-proxy.config.php';
    if (!is_file($configPath)) {
        return [];
    }

    $config = require $configPath;
    return is_array($config) ? $config : [];
}

function qualifyCanvasProxyTarget(string $path): string
{
    global $apiBase;

    $base = rtrim((string) $apiBase, '/');
    if (in_array($path, ['health', 'health/ready'], true)) {
        $base = preg_replace('#/api$#', '', $base);
    }

    return $base . '/' . $path;
}

function qualifyCanvasProxyToken(): string
{
    global $upstreamProxyToken;

    return trim((string) $upstreamProxyToken);
}

function qualifyCanvasSessionCookieHeader(): string
{
    global $sessionCookieName;

    $cookie = $_SERVER['HTTP_COOKIE'] ?? '';
    if ($cookie === '') {
        return '';
    }

    $pairs = [];
    foreach (explode(';', $cookie) as $part) {
        $part = trim($part);
        if ($part === '' || strpos($part, '=') === false) {
            continue;
        }

        [$name, $value] = explode('=', $part, 2);
        if (trim($name) === $sessionCookieName) {
            $pairs[] = trim($name) . '=' . trim($value);
        }
    }

    return implode('; ', $pairs);
}

function isAllowedQualifyCanvasPath(string $path, string $method): bool
{
    $rules = [
        '#^health$#' => ['GET'],
        '#^health/ready$#' => ['GET'],
        '#^auth/login$#' => ['POST'],
        '#^auth/logout$#' => ['POST'],
        '#^me$#' => ['GET'],
        '#^customer-editions/[a-z0-9._-]+/entitlement$#i' => ['GET'],
        '#^workspaces/[0-9a-f-]+/settings$#i' => ['GET', 'PATCH'],
        '#^workspaces/[0-9a-f-]+/export\.json$#i' => ['GET'],
        '#^dashboard$#' => ['GET'],
        '#^dashboard/export\.csv$#' => ['GET'],
        '#^quizzes$#' => ['GET', 'POST'],
        '#^quizzes/[0-9a-f-]+$#i' => ['GET', 'PATCH', 'DELETE'],
        '#^quizzes/[0-9a-f-]+/publish$#i' => ['POST'],
        '#^leads$#' => ['GET'],
        '#^leads/export\.csv$#' => ['GET'],
        '#^leads/[0-9a-f-]+$#i' => ['GET'],
        '#^leads/[0-9a-f-]+/report\.pdf$#i' => ['GET'],
        '#^leads/[0-9a-f-]+/resend-email$#i' => ['POST'],
        '#^webhook-deliveries$#' => ['GET'],
        '#^webhook-deliveries/[0-9a-f-]+/retry$#i' => ['POST'],
        '#^team-members$#' => ['GET', 'POST'],
        '#^team-members/[0-9a-f-]+/invite$#i' => ['POST'],
        '#^public/erp-experts/[a-z0-9._-]+$#i' => ['GET'],
        '#^public/erp-experts/[a-z0-9._-]+/sessions$#i' => ['POST'],
        '#^public/sessions/[0-9a-f-]+$#i' => ['PATCH'],
        '#^public/sessions/[0-9a-f-]+/lead$#i' => ['POST'],
        '#^public/sessions/[0-9a-f-]+/events$#i' => ['POST'],
        '#^public/sessions/[0-9a-f-]+/submit$#i' => ['POST'],
    ];

    foreach ($rules as $pattern => $methods) {
        if (preg_match($pattern, $path) === 1 && in_array($method, $methods, true)) {
            return true;
        }
    }

    return false;
}
