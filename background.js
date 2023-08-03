let openEditors = new Map();

async function setEditorStatus(tabId) {
    let composeDetails = await browser.compose.getComposeDetails(tabId);
    if (composeDetails.isPlainText) {
        browser.composeAction.disable(tabId);
        browser.menus.update("edithtml", {enabled: false});
    } else {
        browser.composeAction.enable(tabId);
        browser.menus.update("edithtml", {enabled: true});
    }
}

async function openHtmlEditor(tab) {
    // Check if we have an editor for this tab already.
    if (openEditors.has(tab.id)) {
        browser.windows.update(openEditors.get(tab.id), {focused: true})
        return;
    };

    let sourceEditWindow = await browser.windows.create({
        type:"popup", 
        url: `editor/html-source-editor.html?tabId=${tab.id}`,
        allowScriptsToClose: true,
    });
    openEditors.set(tab.id, sourceEditWindow.id);

    await new Promise(resolve => {
        let listener = windowId => {
            if (windowId != sourceEditWindow.id) {
                return;
            }
            browser.windows.onRemoved.removeListener(listener);
            openEditors.delete(tab.id);
            resolve();
        }
        browser.windows.onRemoved.addListener(listener);
    });
}

async function init() {
    browser.composeAction.setTitle({title: browser.i18n.getMessage("sourceHTML")});
    
    let composeTabs = await browser.tabs.query({type:"messageCompose"});
    for (let composeTab of composeTabs) {
        setEditorStatus(composeTab.id);
    }

    browser.tabs.onCreated.addListener(async tab => {
        if (tab.type == "messageCompose") {
            setEditorStatus(tab.id);
        }
    })

    browser.menus.create({
        id: "edithtml",
        contexts: ["compose_body"],
        onclick: (info, tab) => openHtmlEditor(tab),
        title: browser.i18n.getMessage("sourceHTML")
    })

    browser.composeAction.onClicked.addListener((tab, info) => openHtmlEditor(tab));

}
init();
