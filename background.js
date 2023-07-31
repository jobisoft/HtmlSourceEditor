async function init() {
    await browser.ResourceUrl.register("edithtmladdon","chrome/");
    
    let composeWindows = await browser.windows.getAll({windowTypes: ["messageCompose"]});
    for (let composeWindow of composeWindows) {
        await browser.EditHTML.patchComposer(composeWindow.id);
    }

    browser.tabs.onCreated.addListener(async tab => {
        if (tab.type == "messageCompose") {
            let composeDetails = await browser.compose.getComposeDetails(tab.id);
            console.log(composeDetails);
            await browser.EditHTML.patchComposer(tab.windowId);
        }
    })
}
init();
