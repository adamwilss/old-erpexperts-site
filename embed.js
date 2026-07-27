/**
 * Qualify Canvas Embed Bootloader
 *
 * Inline usage:
 *   <div id="qualifycanvas"></div>
 *   <script src="https://qualifycanvas.app/embed.js"
 *     data-workspace="demo-workspace"
 *     data-quiz="demo-assessment"></script>
 *
 * Backwards compatible:
 *   data-slug="demo-assessment"
 */
(function () {
  "use strict";

  var scripts = document.querySelectorAll("script[data-quiz],script[data-slug]");
  var me = scripts[scripts.length - 1];
  var quizSlug = (me && (me.getAttribute("data-quiz") || me.getAttribute("data-slug"))) || "";
  var workspaceSlug = (me && me.getAttribute("data-workspace")) || "demo-workspace";
  var mode = ((me && me.getAttribute("data-mode")) || "inline").toLowerCase();
  var targetId = ((me && me.getAttribute("data-target")) || "qualifycanvas").replace(/^#/, "");
  var buttonText = (me && me.getAttribute("data-button-text")) || "Take the assessment";
  var logoUrl = (me && (me.getAttribute("data-logo-url") || me.getAttribute("data-brand-logo"))) || "";

  if (!quizSlug) return console.error("Qualify Canvas: missing data-quiz or data-slug attribute");

  var scriptUrl = new URL(me.src || document.currentScript.src);
  var apiBaseAttribute = me && me.getAttribute("data-api-base");
  var apiBase = apiBaseAttribute
    ? new URL(apiBaseAttribute, scriptUrl.origin).href.replace(/\/$/, "")
    : scriptUrl.origin;
  var bundleVersion = (me && (me.getAttribute("data-bundle-version") || me.getAttribute("data-version"))) || "2026-06-02";
  var bundleUrl = scriptUrl.href.replace(/embed\.js(?:\?.*)?$/, "embed-bundle.js");
  var bundleUrlObject = new URL(bundleUrl, scriptUrl.origin);
  if (!bundleUrlObject.searchParams.has("v")) bundleUrlObject.searchParams.set("v", bundleVersion);
  bundleUrl = bundleUrlObject.href;
  var publicUrlAttribute = me && me.getAttribute("data-public-url");
  var fullPageUrl = publicUrlAttribute
    ? new URL(publicUrlAttribute, scriptUrl.origin).href
    : scriptUrl.origin + "/" + encodeURIComponent(quizSlug);

  function findTarget(callback) {
    var target = document.getElementById(targetId);
    if (target) return callback(target);
    document.addEventListener("DOMContentLoaded", function () {
      target = document.getElementById(targetId);
      if (target) callback(target);
      else console.error("Qualify Canvas: element #" + targetId + " not found");
    });
  }

  function loadBundle(callback) {
    window.__QUALIFY_CANVAS_API_BASE__ = apiBase;
    if (window.QualifyCanvasEmbed && window.QualifyCanvasEmbed.mount) return callback();
    var script = document.createElement("script");
    script.setAttribute("data-qualifycanvas-bundle", "true");
    script.src = bundleUrl;
    script.onload = callback;
    script.onerror = function () {
      console.error("Qualify Canvas: failed to load embed bundle from " + bundleUrl);
    };
    document.head.appendChild(script);
  }

  function mount(container) {
    if (container.dataset.qualifyCanvasMounting === "true") return;
    if (container.dataset.qualifyCanvasMounted === "true" && container.shadowRoot) return;
    window.__QUALIFY_CANVAS_API_BASE__ = apiBase;

    container.dataset.qualifyCanvasMounting = "true";
    container.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;padding:48px;">' +
      '<div style="width:28px;height:28px;border:3px solid #e2e8f0;border-top-color:#7c3aed;border-radius:50%;animation:qc-spin 0.6s linear infinite;"></div>' +
      "</div>" +
      "<style>@keyframes qc-spin{to{transform:rotate(360deg)}}</style>";

    loadBundle(function () {
      container.innerHTML = "";
      if (window.QualifyCanvasEmbed && window.QualifyCanvasEmbed.mount) {
        window.QualifyCanvasEmbed.mount(container, {
          workspaceSlug: workspaceSlug,
          quizSlug: quizSlug,
          apiBase: apiBase,
          logoUrl: logoUrl,
        });
        container.dataset.qualifyCanvasMounted = "true";
      } else {
        console.error("Qualify Canvas: embed bundle loaded but mount function not found");
      }
      delete container.dataset.qualifyCanvasMounting;
    });
  }

  function renderPopup(target) {
    var button = document.createElement("button");
    button.type = "button";
    button.textContent = buttonText;
    button.style.cssText =
      "border:0;border-radius:9999px;background:#7c3aed;color:white;padding:12px 20px;font-weight:700;cursor:pointer;font-family:Inter,system-ui,sans-serif;";

    var overlay = document.createElement("div");
    overlay.style.cssText =
      "display:none;position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,0.55);align-items:center;justify-content:center;padding:20px;";
    overlay.innerHTML =
      '<div style="width:min(760px,96vw);height:min(780px,90vh);background:white;border-radius:16px;overflow:auto;position:relative;">' +
      '<button type="button" aria-label="Close" style="position:absolute;top:10px;right:12px;z-index:2;border:0;background:white;border-radius:9999px;width:36px;height:36px;font-size:24px;line-height:1;cursor:pointer;">×</button>' +
      '<div data-qualifycanvas-popup-mount></div>' +
      "</div>";
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) overlay.style.display = "none";
    });
    overlay.querySelector("button").addEventListener("click", function () {
      overlay.style.display = "none";
    });
    button.addEventListener("click", function () {
      overlay.style.display = "flex";
      var mountPoint = overlay.querySelector("[data-qualifycanvas-popup-mount]");
      if (!mountPoint.shadowRoot && !mountPoint.dataset.mounted) {
        mountPoint.dataset.mounted = "true";
        mount(mountPoint);
      }
    });

    target.innerHTML = "";
    target.appendChild(button);
    document.body.appendChild(overlay);
  }

  findTarget(function (target) {
    if (mode === "popup") return renderPopup(target);
    if (mode === "link" || mode === "full-page") {
      target.innerHTML = '<a href="' + fullPageUrl + '">' + buttonText + "</a>";
      return;
    }
    mount(target);
  });
})();
