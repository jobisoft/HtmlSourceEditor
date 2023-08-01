async function setButtonStatus(tabId) {
    let composeDetails = await browser.compose.getComposeDetails(tabId);
    if (composeDetails.isPlainText) {
        browser.composeAction.disable(tabId);
    } else {
        browser.composeAction.enable(tabId);
    }
}

async function init() {
    browser.composeAction.setTitle({title: browser.i18n.getMessage("sourceHTML")});
    
    let composeTabs = await browser.tabs.query({type:"messageCompose"});
    for (let composeTab of composeTabs) {
        setButtonStatus(composeTab.id);
    }

    browser.tabs.onCreated.addListener(async tab => {
        if (tab.type == "messageCompose") {
            setButtonStatus(tab.id);
        }
    })

    browser.composeAction.onClicked.addListener(async (tab, info) => {
        let sourceEditWindow = await browser.windows.create({
            type:"popup", 
            url: `editor/html-source-editor.html?tabId=${tab.id}`,
            allowScriptsToClose: true,
        });

        await new Promise(resolve => {
            let listener = windowId => {
                if (windowId != sourceEditWindow.id) {
                    return;
                }
                browser.windows.onRemoved.removeListener(listener);
                browser.composeAction.enable(tab.id);
                resolve();
            }
            browser.composeAction.disable(tab.id);
            browser.windows.onRemoved.addListener(listener);
        });
    });

}
init();
