const addConsentListener = require('addConsentListener');
const copyFromDataLayer = require('copyFromDataLayer');
const copyFromWindow = require('copyFromWindow');
const createArgumentsQueue = require('createArgumentsQueue');
const createQueue = require('createQueue');
const getType = require('getType');
const injectScript = require('injectScript');
const isConsentGranted = require('isConsentGranted');
const JSON = require('JSON');
const localStorage = require('localStorage');
const makeInteger = require('makeInteger');
const makeNumber = require('makeNumber');
const makeString = require('makeString');
const makeTableMap = require('makeTableMap');
const Object = require('Object');
const templateStorage = require('templateStorage');

// Call-once methods.
let gtmOnSuccess = () => {
  gtmOnSuccess = () => {};
  return data.gtmOnSuccess();
};

let gtmOnFailure = () => {
  gtmOnFailure = () => {};
  return data.gtmOnFailure();
};

/*==============================================================================
==============================================================================*/

const QUEUE_NAME = 'spdt';

const isManualConsentDenied =
  !data.enableGoogleConsentMode && isUIConsentFieldDenied(data.consentGranted);
if (isManualConsentDenied) {
  return gtmOnSuccess();
}

const pixelKey = trim(makeString(data.pixelKey || ''));
if (!pixelKey) {
  return gtmOnFailure();
}

const isManualOrGCMConsentGranted = data.enableGoogleConsentMode
  ? isConsentGranted('ad_storage')
  : true;

const eventCommand = getEventCommand(data);
const eventParameters = eventCommand ? getEventParameters(data, eventCommand) : undefined;
const userData = getUserData(data, isManualOrGCMConsentGranted);

getOrCreateQueue();

runOnConsentGranted(isManualOrGCMConsentGranted, () => {
  const queue = getOrCreateQueue();
  queue('conf', { key: pixelKey });
  if (objHasProps(userData)) queue('alias', userData);
  if (eventCommand) {
    if (objHasProps(eventParameters)) queue(eventCommand, eventParameters);
    else queue(eventCommand);
  }
});

pushEventIdToDataLayer(data);

runOnConsentGranted(isManualOrGCMConsentGranted, () => {
  loadSDK();
});

if (!isManualOrGCMConsentGranted) {
  // If consent is revoked/pending, call gtmOnSuccess to avoid a "Still running" status.
  // The queued work above will run later via the consent listener.
  return gtmOnSuccess();
}

/*==============================================================================
  Vendor related functions
==============================================================================*/

function getOrCreateQueue() {
  const existingQueue = copyFromWindow(QUEUE_NAME);
  if (getType(existingQueue) === 'function') return existingQueue;

  return createArgumentsQueue(QUEUE_NAME, QUEUE_NAME + '.q');
}

function loadSDK() {
  injectScript(
    'https://pixel.byspotify.com/ping.min.js',
    gtmOnSuccess,
    gtmOnFailure,
    'spotifyPixel'
  );
}

function runOnConsentGranted(isManualOrGCMConsentGranted, callback) {
  if (isManualOrGCMConsentGranted) {
    callback();
    return;
  }

  if (!data.enableGoogleConsentMode) return;

  const callbacksKey = 'spdt_consent_callbacks_ad_storage';
  const queuedCallbacks = templateStorage.getItem(callbacksKey) || [];
  queuedCallbacks.push(callback);
  templateStorage.setItem(callbacksKey, queuedCallbacks);

  const listenerAddedKey = 'spdt_consent_listener_added_ad_storage';
  if (!templateStorage.getItem(listenerAddedKey)) {
    templateStorage.setItem(listenerAddedKey, true);
    addConsentListener('ad_storage', (type, granted) => {
      if (type !== 'ad_storage' || !granted) return;
      const callbacksToRun = templateStorage.getItem(callbacksKey) || [];
      templateStorage.setItem(callbacksKey, []);
      callbacksToRun.forEach((cb) => cb());
    });
  }
}

function getEventCommand(data) {
  if (data.eventNameSetupMethod === 'inherit') {
    const dlEvent = copyFromDataLayer('event');

    // prettier-ignore
    const ga4ToSpotifyEventName = {
      page_view: 'view', 'gtm.init': 'view', 'gtm.js': 'view', 'gtm.historyChange': 'view', 'gtm.dom': 'view',
      view_item: 'product',
      generate_lead: 'lead',
      sign_up: 'signup',
      add_to_cart: 'addtocart',
      begin_checkout: 'checkout',
      purchase: 'purchase',

      page_view_stape: 'view',
      view_item_stape: 'product',
      sign_up_stape: 'signup',
      add_to_cart_stape: 'addtocart',
      begin_checkout_stape: 'checkout',
      purchase_stape: 'purchase',

      'gtm4wp.productClickEEC': 'product',
      'gtm4wp.addProductToCartEEC': 'addtocart',
      'gtm4wp.checkoutStepEEC': 'checkout',
      'gtm4wp.orderCompletedEEC': 'purchase'
    };

    return ga4ToSpotifyEventName[dlEvent];
  }

  return data.eventName === 'standard' ? data.eventNameStandard : data.eventNameCustom;
}

function getEventParameters(data, eventCommand) {
  const eventParameters = {};

  if (data.enableDataLayerMapping) {
    let ecommerce = copyFromDataLayerWithVersion('ecommerce');
    if (getType(ecommerce) !== 'object') ecommerce = {};
    addGA4EventParameters(eventParameters, ecommerce, eventCommand);
  }

  if (getType(data.eventParametersFromVariable) === 'object') {
    assign(eventParameters, data.eventParametersFromVariable);
  }

  if (data.eventParametersList && data.eventParametersList.length) {
    assign(eventParameters, makeTableMap(data.eventParametersList, 'name', 'value'));
  }

  if (data.eventId) {
    eventParameters.event_id = makeString(data.eventId);
  }

  return eventParameters;
}

function addGA4EventParameters(eventParameters, ecommerce, eventCommand) {
  const items = copyFromDataLayerWithVersion('items') || ecommerce.items;

  if (getType(items) === 'array' && items.length) {
    let quantity = 0;
    items.forEach((item) => {
      quantity += makeInteger(item.quantity) || 1;
    });
    if (quantity) eventParameters.quantity = quantity;

    // "line_items" only exists in Spotify's checkout/purchase schema -- every
    // other event (product, addtocart, etc.) has just one product_id/name/...
    // slot, not an array, so there's no faithful way to auto-map multiple GA4
    // items onto it. Rather than silently picking one item and dropping the
    // rest, leave those fields unmapped for non-checkout/purchase events;
    // they can still be set explicitly via the Event Parameters table/variable.
    if (eventCommand === 'checkout' || eventCommand === 'purchase') {
      eventParameters.line_items = items.map(mapGA4ItemToLineItem);
    }
  }

  const value = ecommerce.value || copyFromDataLayerWithVersion('value');
  if (value) eventParameters.value = makeNumber(value);

  const currency =
    ecommerce.currency ||
    copyFromDataLayerWithVersion('currency') ||
    (getType(items) === 'array' && items.length ? items[0].currency : undefined);
  if (currency) eventParameters.currency = currency;
}

function mapGA4ItemToLineItem(item) {
  const lineItem = {};
  if (item.item_id) lineItem.product_id = makeString(item.item_id);
  if (item.item_name) lineItem.product_name = makeString(item.item_name);
  if (item.item_category) lineItem.product_type = makeString(item.item_category);
  if (item.item_brand) lineItem.product_vendor = makeString(item.item_brand);
  if (item.item_variant_id) lineItem.variant_id = makeString(item.item_variant_id);
  if (item.item_variant) lineItem.variant_name = makeString(item.item_variant);
  if (item.price) lineItem.value = makeNumber(item.price);
  if (item.quantity) lineItem.quantity = makeInteger(item.quantity);
  return lineItem;
}

// Spotify's pixel script hashes "email" and "phone_number" itself, unconditionally,
// with no detection of an already-hashed value (verified against the live SDK) —
// so this tag must send them RAW and never pre-hash them, or Spotify would hash an
// already-hashed value again and break attribution matching. "id" is the one
// exception: the pixel never touches it, so the caller is expected to supply an
// already-hashed internal ID for that field.
function getUserData(data, isManualOrGCMConsentGranted) {
  if (!data.enableAdvancedMatching) return {};

  let userData = {};

  if (data.enableEventUserDataEnhancement) {
    userData = getEventUserDataEnhancement(isManualOrGCMConsentGranted);
  }

  if (data.enableDataLayerMapping) {
    const userDataFromDataLayer = copyFromDataLayerWithVersion('user_data');
    if (getType(userDataFromDataLayer) === 'object') {
      addUserData(userData, userDataFromDataLayer);
    }
  }

  if (getType(data.userDataFromVariable) === 'object') {
    addUserData(userData, data.userDataFromVariable);
  }

  if (data.userDataList && data.userDataList.length) {
    assign(userData, makeTableMap(data.userDataList, 'name', 'value'));
  }

  if (objIsEmptyOrContainsOnlyFalsyValues(userData)) return {};

  if (data.enableEventUserDataEnhancement) {
    storeEventUserDataEnhancement(isManualOrGCMConsentGranted, userData);
  }

  return userData;
}

function addUserData(userData, source) {
  const email = source.email || source.email_address || source.em;
  const emailType = getType(email);
  if (email) userData.email = trim(makeString(emailType === 'array' ? email[0] : email));

  const phone = source.phone_number || source.phone || source.ph;
  const phoneType = getType(phone);
  if (phone) userData.phone_number = trim(makeString(phoneType === 'array' ? phone[0] : phone));

  const id = source.id || source.user_id || source.userId || source.external_id;
  if (id) userData.id = trim(makeString(id));

  const clickId = source.click_id;
  if (clickId) userData.click_id = trim(makeString(clickId));

  const partnerUserId = source.partner_user_id;
  if (partnerUserId) userData.partner_user_id = trim(makeString(partnerUserId));

  return userData;
}

function getEventUserDataEnhancement(isManualOrGCMConsentGranted) {
  if (!isManualOrGCMConsentGranted || !localStorage) return {};

  const stored = localStorage.getItem('gtmeec-sp');
  if (stored) {
    const parsed = JSON.parse(stored);
    if (getType(parsed) === 'object') return parsed;
  }

  return {};
}

function storeEventUserDataEnhancement(isManualOrGCMConsentGranted, userData) {
  if (!isManualOrGCMConsentGranted || !localStorage || !objHasProps(userData)) return;
  localStorage.setItem('gtmeec-sp', JSON.stringify(userData));
}

function pushEventIdToDataLayer(data) {
  if (!data.pushEventIdToDataLayer) return;

  const dataLayerVariableName = data.eventIdDataLayerVariableName || 'dataLayer';
  const dataLayerPush = createQueue(dataLayerVariableName);
  dataLayerPush({
    eventId: data.eventId,
    event: data.eventIdDataLayerEventName || 'spotifyPixelDataLayerPush'
  });
}

/*==============================================================================
  Helpers
==============================================================================*/

function isUIConsentFieldDenied(field) {
  return [false, 'false', 0, '0', 'denied'].indexOf(field) !== -1;
}

function assign(target, source) {
  if (!source) return target;
  Object.keys(source).forEach((key) => {
    target[key] = source[key];
  });
  return target;
}

function objHasProps(obj) {
  return getType(obj) === 'object' && Object.keys(obj).length > 0;
}

function objIsEmptyOrContainsOnlyFalsyValues(obj) {
  if (getType(obj) !== 'object') return true;
  const values = Object.values(obj);
  return values.length === 0 || values.every((v) => !v);
}

function trim(value) {
  if (!value) return value;
  return makeString(value).trim();
}

function copyFromDataLayerWithVersion(key) {
  const dataLayerVersion = data.enableMostRecentDataLayerEventOnly ? 1 : 2;
  return copyFromDataLayer(key, dataLayerVersion);
}
