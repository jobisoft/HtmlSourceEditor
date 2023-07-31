var { ExtensionCommon } = ChromeUtils.import("resource://gre/modules/ExtensionCommon.jsm");
var { ExtensionSupport } = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");
var { ExtensionParent } = ChromeUtils.import("resource://gre/modules/ExtensionParent.jsm");

function install(composeWindow) {
  console.log("INSTALL");

  composeWindow.EditHTMLAddon = {
    FocusSourceCodeEditor: function () {
      console.log("FocusSourceCodeEditor")
      let messageEditor = composeWindow.document.getElementById("messageEditor");
      let htmlEditorBox = composeWindow.document.getElementById("edithtmladdon-content-source-box");
      let htmlEditor = composeWindow.document.getElementById("edithtmladdon-content-source-ace");
      messageEditor.collapsed = true;
      htmlEditorBox.collapsed = false;
      htmlEditor.contentWindow.focus();
    },
    FocusDefaultEditor: function () {
      console.log("FocusDefaultEditor");
      let messageEditor = composeWindow.document.getElementById("messageEditor");
      let htmlEditorBox = composeWindow.document.getElementById("edithtmladdon-content-source-box");
      messageEditor.collapsed = false;
      htmlEditorBox.collapsed = true;
      messageEditor.contentWindow.focus();
    }
  }

  let extension = ExtensionParent.GlobalManager.getExtension("edithtmlsource@jobisoft.de");

  let tabBox = `
  <hbox id="edithtmladdon-tabbox-box">
    <tabbox id="edithtmladdon-content-tabbox">
      <tabs id="edithtmladdon-content-tabs" flex="1">
        <tab id="edithtmladdon-content-tab1" label="${extension.localeData.localizeMessage("stationery.Composer.Tab.Edit")}" />
        <tab id="edithtmladdon-content-tab2" label="${extension.localeData.localizeMessage("stationery.Composer.Tab.Source")}" />
      </tabs> 
    </tabbox>
  </hbox>
  <vbox id="edithtmladdon-content-source-box" collapsed="true" flex="1">
    <iframe id="edithtmladdon-content-source-ace" data-preview="true" flex="1" src="resource://edithtmladdon/content/html-source-editor.html" />
  </vbox>`;
  let injectedElements = composeWindow.MozXULElement.parseXULToFragment(tabBox);
  let messageArea = composeWindow.document.getElementById("messageArea");
  let messageEditor = composeWindow.document.getElementById("messageEditor");
  messageArea.insertBefore(injectedElements, messageEditor);

  let tab1 = composeWindow.document.getElementById("edithtmladdon-content-tab1");
  let tab2 = composeWindow.document.getElementById("edithtmladdon-content-tab2");
  tab1.addEventListener("click", composeWindow.EditHTMLAddon.FocusDefaultEditor)
  tab2.addEventListener("click", composeWindow.EditHTMLAddon.FocusSourceCodeEditor)
}

function uninstall(composeWindow) {
  console.log("UNINSTALL");

  composeWindow.document.getElementById("edithtmladdon-tabbox-box").remove();
  composeWindow.document.getElementById("edithtmladdon-content-source-box").remove();
  delete composeWindow.EditHTMLAddon;
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
