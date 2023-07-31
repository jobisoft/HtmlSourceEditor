var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { ExtensionSupport } = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");

function install(composeWindow) {
  console.log("PATCHING");
}

function uninstall(composeWindow) {
  console.log("UNPATCHING");
}

var EditHTML = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      EditHTML: {
        async patchComposer(windowId) {
            let windowObject = context.extension.windowManager.get(windowId);
            if (!windowObject) {
              return;
            }
            let {window} = windowObject;
            let windowType = window.document.documentElement.getAttribute("windowtype");
            if (windowType != "msgcompose") {
              return;
            }
            install(window);
        },
      },
    };
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) return;

    // Uninstall from any compose window.
    for (let window of Services.wm.getEnumerator("msgcompose")) {
      uninstall(window);
    }
  }
};
