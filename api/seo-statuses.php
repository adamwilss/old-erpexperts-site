<?php
/**
 * Simple JSON API for SEO Roadmap article statuses.
 * Canonical source of truth is this endpoint + seo-statuses.json on disk.
 * The JSON file is storage, this PHP endpoint is the write gate.
 *
 * GET  → returns the current statuses object
 * POST → expects JSON body { "statuses": { "1a": "in_progress", ... } }
 *        merges into existing file and returns updated statuses
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Handle CORS preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Lightweight CSRF/origin guard for POST updates.
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($origin !== '') {
        $originHost = parse_url($origin, PHP_URL_HOST) ?: '';
        if ($originHost !== $host) {
            http_response_code(403);
            echo json_encode(['error' => 'Cross-origin POST blocked']);
            exit;
        }
    }
}

$file = __DIR__ . '/seo-statuses.json';

// Ensure the file exists
if (!file_exists($file)) {
    file_put_contents($file, '{}');
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $data = file_get_contents($file);
    echo $data;
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !isset($input['statuses']) || !is_array($input['statuses'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid payload. Expected { "statuses": { ... } }']);
        exit;
    }

    // Validate status values
    $allowed = ['todo', 'in_progress', 'done'];
    foreach ($input['statuses'] as $key => $value) {
        if (!in_string_array($value, $allowed)) {
            http_response_code(400);
            echo json_encode(['error' => "Invalid status '$value' for key '$key'"]);
            exit;
        }
    }

    // Read existing, merge, write back
    $existing = json_decode(file_get_contents($file), true) ?: [];
    $merged = array_merge($existing, $input['statuses']);
    file_put_contents($file, json_encode($merged, JSON_PRETTY_PRINT));

    echo json_encode($merged);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

function in_string_array($needle, $haystack) {
    return in_array($needle, $haystack, true);
}
