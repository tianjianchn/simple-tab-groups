
import * as Constants from './constants.js';
import JSON from './json.js';
import * as Cache from './cache.js';
import * as Containers from './containers.js';

export const BROWSER_PAGES_STARTS = 'about:';

const tagsToReplace = {
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
    '&': '&amp;',
};

const INNER_HTML = 'innerHTML';

export function unixNow() {
    return Math.round(Date.now() / 1000);
}

const TYPE_REGEXP = /(^\[.+\ |\]$)/g;
export function type(obj) {
    return Object.prototype.toString.call(obj).replace(TYPE_REGEXP, '').toLowerCase();
}

export function catchFunc(asyncFunc) {
    let fromStack = new Error().stack;
    return async function() {
        try {
            return await asyncFunc(...Array.from(arguments));
        } catch (e) {
            e.message = `[catchFunc]: ${e.message}`;
            e.stack = fromStack + e.stack;
            e.arguments = JSON.clone(Array.from(arguments));
            self.errorEventHandler(e);
        }
    };
}

/* function formatBytes(bytes, decimals = 2) {
    if (0 === bytes) {
        return '0 Bytes';
    }

    let k = 1024,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
} */

function objectReplaceKeyValue(obj) {
    return Object.keys(obj).reduce((acc, key) => (acc[obj[key]] = key, acc), {});
}

export function safeHtml(html) {
    let regExp = new RegExp('[' + Object.keys(tagsToReplace).join('') + ']', 'g');
    return (html || '').replace(regExp, tag => tagsToReplace[tag] || tag);
}

export function unSafeHtml(html) {
    let replasedTags = objectReplaceKeyValue(tagsToReplace),
        regExp = new RegExp('(' + Object.keys(replasedTags).join('|') + ')', 'g');
    return (html || '').replace(regExp, tag => replasedTags[tag] || tag);
}

export function b64EncodeUnicode(str) {
    // first we use encodeURIComponent to get percent-encoded UTF-8,
    // then we convert the percent encodings into raw bytes which
    // can be fed into btoa.
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
        function toSolidBytes(match, p1) {
            return String.fromCharCode('0x' + p1);
        }));
}

export function b64DecodeUnicode(str) {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(atob(str).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

export function sliceText(text, length = 50) {
    return (text?.length > length) ? (text.slice(0, length - 3) + '...') : (text || '');
}

export async function notify(message, sec = 20, id = null, iconUrl = null, onClick = null, onClose = null) {
    if (id) {
        await browser.notifications.clear(id);
    } else {
        id = String(Date.now());
    }

    // https://developer.mozilla.org/en-US/Add-ons/WebExtensions/API/notifications/NotificationOptions
    // Only 'type', 'iconUrl', 'title', and 'message' are supported.
    await browser.notifications.create(id, {
        type: 'basic',
        iconUrl: iconUrl || '/icons/icon.svg',
        title: browser.i18n.getMessage('extensionName'),
        message: Array.isArray(message) ? browser.i18n.getMessage(...message) : String(message),
    });

    let rejectTimer = null,
        listener = function(id, calledId) {
            if (id !== calledId) {
                return;
            }

            browser.notifications.onClicked.removeListener(listener);
            browser.notifications.onClosed.removeListener(onClosedListener);

            clearTimeout(rejectTimer);
            onClick && onClick(id);
        }.bind(null, id),
        onClosedListener = function(id, calledId, calledBy) {
            if (id !== calledId) {
                return;
            }

            browser.notifications.onClicked.removeListener(listener);
            browser.notifications.onClosed.removeListener(onClosedListener);
            browser.notifications.clear(id);

            if (calledBy !== 'timeout') {
                clearTimeout(rejectTimer);
                onClose && onClose(id);
            }
        }.bind(null, id);

    rejectTimer = setTimeout(onClosedListener, sec * 1000, id, 'timeout');

    browser.notifications.onClicked.addListener(listener);
    browser.notifications.onClosed.addListener(onClosedListener);

    return id;
}

export function isAllowExternalRequestAndSender(request, sender, extensionRules = {}) {
    // if (sender?.id?.startsWith('test-stg-action')) {
    //     return true;
    // }

    let extension = Constants.EXTENSIONS_WHITE_LIST[sender.id];

    if (!extension) {
        return false;
    }

    Object.assign(extensionRules, extension);

    if (!request || 'object' !== type(request)) {
        extensionRules.error = 'request is wrong';
        return false;
    }

    return extension.getActions.includes(request.action);
}

export function getSupportedExternalExtensionName(extId) {
    return Constants.EXTENSIONS_WHITE_LIST[extId] ? Constants.EXTENSIONS_WHITE_LIST[extId].title : 'Unknown';
}

export function isAvailableFavIconUrl(favIconUrl) {
    if (!favIconUrl) {
        return false;
    }

    return !favIconUrl.startsWith('chrome://mozapps/skin/');
}

export function normalizeTabFavIcon(tab) {
    if (!isAvailableFavIconUrl(tab.favIconUrl)) {
        tab.favIconUrl = '/icons/tab.svg';
    }

    return tab;
}

export function isWindowAllow({type}) {
    return browser.windows.WindowType.NORMAL === type;
}

const createTabUrlRegexp = /^((http|ftp|moz-extension)|about:blank)/,
    emptyUrlsArray = new Set(['about:blank', 'about:newtab', 'about:home']);

export function isUrlEmpty(url) {
    return emptyUrlsArray.has(url);
}

export function isUrlAllowToCreate(url) {
    return createTabUrlRegexp.test(url);
}

export function normalizeUrl(url) {
    if (null == url || 'string' !== typeof url) {
        url = '';
    }

    if (url.startsWith('moz-extension')) {
        let urlObj = new URL(url),
            urlStr = urlObj.searchParams.get('url') || urlObj.searchParams.get('u') || urlObj.searchParams.get('go');

        return urlStr ? normalizeUrl(urlStr) : url;
    } else if (url.startsWith('about:reader')) {
        return decodeURIComponent(url.slice(17));
    }

    return url;
}

export function normalizeTabUrl(tab) {
    tab.url = normalizeUrl(tab.url);

    return tab;
}

/*const UUIDRegExp = /^moz-extension:\/\/([a-f\-\d]+)\//;

function getUUIDFromUrl(url) {
    let [, uuid] = UUIDRegExp.exec(url);
    return uuid;
}*/

export function setUrlSearchParams(url, params = {}) {
    let urlObj = new URL(url, Constants.STG_BASE_URL);

    for (let i in params) {
        urlObj.searchParams.set(i, params[i]);
    }

    return urlObj.href;
}

export function isTabPinned(tab) {
    return tab.pinned === true;
}

export function isTabNotPinned(tab) {
    return !isTabPinned(tab);
}

export function isTabCanBeHidden(tab) {
    return !isTabPinned(tab) && tab.sharingState && !tab.sharingState.screen && !tab.sharingState.camera && !tab.sharingState.microphone;
}

export function isTabCanNotBeHidden(tab) {
    return !isTabCanBeHidden(tab);
}

export function isTabLoaded(tab) {
    return tab.status === browser.tabs.TabStatus.COMPLETE;
}

export function isTabLoading(tab) {
    return tab.status === browser.tabs.TabStatus.LOADING;
}

export function concatTabs(windowsOrGroups) {
    return windowsOrGroups.reduce((acc, wg) => [...acc, ...wg.tabs], []);
}

export function getLastActiveTab(tabs) {
    return tabs.find(tab => tab.active) || tabs.slice().sort(sortBy('lastAccessed')).pop();
}

export function getNextIndex(index, length, textPosition = 'next') {
    if (!length || length < 0) {
        return false;
    }

    if (1 === length) {
        return 0;
    }

    if ('next' === textPosition) {
        return (index + 1) % length;
    } else if ('prev' === textPosition) {
        return 0 === index ? length - 1 : index - 1;
    } else {
        throw Error(`invalid textPosition: ${textPosition}`);
    }
}

export function toCamelCase(str) {
    return str.replace(/^([A-Z])|[\s_-](\w)/g, function(match, p1, p2) {
        return p2 ? p2.toUpperCase() : p1.toLowerCase();
    });
}

export function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

export function sortBy(key, numeric, reverse) {
    return (objA, objB) => {
        return reverse ?
            compareStrings(objB[key], objA[key], numeric) :
            compareStrings(objA[key], objB[key], numeric);
    };
}

export function scrollTo(node) {
    if (typeof node === 'string') {
        node = document.querySelector(node);
    }

    node?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
    });
}

// -1 : a < b
// 0 : a === b
// 1 : a > b
export function compareStrings(a, b, numeric = true) {
    return String(a).localeCompare(String(b), [], {
        numeric: numeric,
    });
}

export function isElementVisible(element) {
    let rect = element.getBoundingClientRect();

    // Only completely visible elements return true:
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
    // Partially visible elements return true:
    // let isVisible = elemTop < window.innerHeight && elemBottom >= 0;
    // return isVisible;
}

export function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
}

export function randomColor() {
    return 'hsla(' + getRandomInt(0, 360) + ', 100%, 50%, 1)';
}

export function safeColor(color) {
    let div = document.createElement('div');
    div.style.backgroundColor = color;
    return div.style.backgroundColor;
}

export function convertSvgToUrl(svg) {
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function isSvg(url) {
    return url.startsWith('data:image/svg+xml');
}

export function normalizeSvg(svgUrl) {
    let svg = null;

    if (svgUrl.startsWith('data:image/svg+xml;base64,')) {
        let [, svgBase64] = svgUrl.split('data:image/svg+xml;base64,');
        svg = b64DecodeUnicode(svgBase64);
    } else {
        let [, svgURI] = svgUrl.split('data:image/svg+xml,');
        svg = decodeURIComponent(svgURI);
    }

    let div = document.createElement('div');

    div[INNER_HTML] = svg;

    let svgNode = div.querySelector('svg');

    [...svgNode.children].forEach(function(node) {
        if (!node.attributes.fill || node.attributes.fill.textContent === 'currentColor') {
            node.setAttribute('fill', 'context-fill');
        }
    });

    return convertSvgToUrl(div[INNER_HTML]);
}

export function normalizeGroupIcon(iconUrl) {
    return new Promise(function(resolve, reject) {
        if (isSvg(iconUrl)) {
            resolve(normalizeSvg(iconUrl));
        } else {
            let img = new Image();

            img.addEventListener('load', () => {
                if (img.height > 64 || img.width > 64) {
                    resolve(resizeImage(img, 64, 64));
                } else {
                    resolve(iconUrl);
                }
            });

            img.addEventListener('error', () => reject('Error load icon'));

            img.src = iconUrl;
        }
    });
}

export function resizeImage(img, height, width, useTransparency = true, ...canvasParams) { // img: new Image()
    let canvas = document.createElement('canvas'),
        context = canvas.getContext('2d');

    if (!useTransparency) {
        canvas.mozOpaque = true;
    }

    canvas.width = width;
    canvas.height = height;

    context.drawImage(img, 0, 0, width, height);

    return isCanvasBlank(canvas, useTransparency, ...canvasParams) ? null : canvas.toDataURL(...canvasParams);
}

function isCanvasBlank(canvas, useTransparency, ...canvasParams) {
    let blank = document.createElement('canvas'),
        canvasDataUrl = canvas.toDataURL(...canvasParams);

    if (!useTransparency) {
        blank.mozOpaque = true;
    }

    blank.width = canvas.width;
    blank.height = canvas.height;

    let isEmpty = canvasDataUrl === blank.toDataURL(...canvasParams);

    if (!isEmpty) {
        let blankContext = blank.getContext('2d');

        blankContext.fillStyle = 'rgb(255, 255, 255)';
        blankContext.fillRect(0, 0, blank.width, blank.height);

        isEmpty = canvasDataUrl === blank.toDataURL(...canvasParams);
    }

    return isEmpty;
}

// needle need to be "LowerCased"
export function mySearchFunc(needle, haystack, extendedSearch = false) {
    haystack = 'string' === typeof haystack ? haystack.toLowerCase() : '';

    if (!extendedSearch) {
        return haystack.includes(needle);
    }

    let lastFindIndex = -1;

    return needle
        .split('')
        .every(function(char) {
            if (' ' === char) {
                return true;
            }

            lastFindIndex = haystack.indexOf(char, lastFindIndex + 1);
            return -1 !== lastFindIndex;
        });
}

export function onlyUniqueFilter(value, index, self) {
    return self.indexOf(value) === index;
}

export function onlyUniqueFilterLast(value, index, self) {
    return self.lastIndexOf(value) === index;
}

export function assignKeys(toObj, fromObj, keys) {
    keys.forEach(key => toObj[key] = fromObj[key]);
    return toObj;
}

export function extractKeys(obj, keys, useClone = false) {
    let newObj = {};

    keys.forEach(key => newObj[key] = (useClone ? JSON.clone(obj[key]) : obj[key]));

    return newObj;
}

export function arrayToObj(arr, primaryKey = 'id', accum = {}) {
    return arr.reduce((acc, obj) => (acc[obj[primaryKey]] = obj, acc), accum);
}

export function wait(ms = 200) {
    return new Promise(resolve => setTimeout(resolve, ms, ms));
}

// -1 : a < b
// 0 : a === b
// 1 : a > b
export function compareVersions(a, b) {
    if (a === b) {
        return 0;
    }

    let regExStrip0 = /(\.0+)+$/,
        segmentsA = a.replace(regExStrip0, '').split('.'),
        segmentsB = b.replace(regExStrip0, '').split('.'),
        l = Math.min(segmentsA.length, segmentsB.length);

    for (let i = 0; i < l; i++) {
        let diff = parseInt(segmentsA[i], 10) - parseInt(segmentsB[i], 10);

        if (diff) {
            return diff > 0 ? 1 : -1;
        }
    }

    let diff = segmentsA.length - segmentsB.length;

    if (diff) {
        return diff > 0 ? 1 : -1;
    }

    return 0;
}

export function safeReloadAddon(sec = 3) {
    return setTimeout(() => browser.runtime.reload(), sec * 1000);
}

export function getThemeApply(theme) {
    let isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    return (theme === 'auto' && isDark) ? 'dark' : theme;
}
