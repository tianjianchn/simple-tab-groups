(async function() {
    'use strict';

    const STG_ID = 'simple-tab-groups@drive4ik',
        STG_HOME_PAGE = 'https://addons.mozilla.org/firefox/addon/simple-tab-groups/';

    // let options = {};

    // async function loadOptions() {
    //     options = await browser.storage.local.get(null);
    // }

    // await loadOptions();

    // browser.runtime.onMessageExternal.addListener(function(request, sender, sendResponse) {});

    browser.runtime.onMessage.addListener(async function(request) {
        if (request.updateButton) {
            let options = await browser.storage.local.get(null);
        }
    });

    async function updateGroup(groupsList) {

    }

    function openSTGHomePage() {
        browser.tabs.create({
            url: STG_HOME_PAGE,
        });
    };

    browser.notifications.onClicked.addListener(openSTGHomePage);

    browser.browserAction.onClicked.addListener(async function() {
        browser.runtime.sendMessage(STG_ID, {
            runAction: {
                id: 'add-new-group',
            },
        }, function(responce) {
            if (responce && responce.ok) {
                // if (options.loadLastGroup) { // TODO
                //     browser.runtime.sendMessage(STG_ID, {
                //         runAction: {
                //             id: 'load-last-group',
                //         },
                //     });
                // }
            } else {
                browser.runtime.openOptionsPage();
            }
        });
    });

    // browser.menus.create({
    //     id: 'create-new-group-and-load-it',
    //     title: browser.i18n.getMessage('createNewGroupAndLoadItTitle'),
    //     type: 'checkbox',
    //     contexts: ['browser_action'],
    //     checked: options.loadLastGroup,
    //     onclick: function(info) {
    //         browser.storage.local.set({
    //             loadLastGroup: options.loadLastGroup = info.checked,
    //         });
    //     },
    // });

    browser.runtime.sendMessage(STG_ID, {
        areYouHere: true,
    }, function(responce) {
        if (!responce || !responce.ok) {
            browser.notifications.create('needInstallSTGExtension', {
                type: 'basic',
                iconUrl: '/icons/icon.svg',
                title: browser.i18n.getMessage('extensionName'),
                message: browser.i18n.getMessage('needInstallSTGExtension'),
            });
        }
    });

})()
