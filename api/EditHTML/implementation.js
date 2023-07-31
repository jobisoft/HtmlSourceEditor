var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { ExtensionSupport } = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");

function install(composeWindow) {
  
  let stationeryXul = `
  <vbox id="appcontent">
  <hbox id="stationery-tabbox-box" insertbefore="content-frame">
    <tabbox id="stationery-content-tab" collapsed="true">
      <tabs onselect="Stationery_.SelectEditMode(this.selectedIndex, false);" flex="1">
        <tab label="&stationery.Composer.Tab.Edit;" onfocus="document.getElementById('content-frame').contentWindow.focus()" />
        <tab label="&stationery.Composer.Tab.Source;" onfocus="Stationery.sourceEditor.focus(window)" />
      </tabs> 
    </tabbox>
  </hbox>
  
  <vbox id="stationery-content-source-box" flex="1" collapsed="true">
    <iframe id="stationery-content-source-ace" data-preview="true" flex="1" src="chrome://stationery/content/html-source-editor.html" />
  </vbox>
  </vbox>`;
  
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
