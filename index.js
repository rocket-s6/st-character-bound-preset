const MODULE_NAME = 'st-character-bound-preset';
const FIELD_KEY = 'bound_connection_profile';
const SELECT_ID = 'st-cbp-bound-profile';
const LABEL_ID = 'st-cbp-bound-profile-label';
const NONE_LABEL = 'Bound profile';
const CONNECT_TIMEOUT_MS = 20000;

/** @type {boolean} */
let suppressSelectChange = false;
/** @type {Promise<void>} */
let applyQueue = Promise.resolve();
/** @type {boolean} */
let statusFetchCoalescerInstalled = false;

/**
 * @returns {ReturnType<typeof SillyTavern.getContext>}
 */
function getCtx() {
    return SillyTavern.getContext();
}

/**
 * @param {string} value
 * @returns {string}
 */
function quoteSlashArg(value) {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * @param {object} [character]
 * @returns {{ id?: string, name?: string } | null}
 */
function getBinding(character) {
    const value = character?.data?.extensions?.[FIELD_KEY];
    if (!value) {
        return null;
    }
    if (typeof value === 'string') {
        return { name: value };
    }
    if (typeof value === 'object' && (value.id || value.name)) {
        return value;
    }
    return null;
}

/**
 * @returns {Array<{ id: string, name: string }>}
 */
function getProfiles() {
    const profiles = getCtx().extensionSettings?.connectionManager?.profiles;
    if (!Array.isArray(profiles)) {
        return [];
    }
    return [...profiles].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {{ id?: string, name?: string }} binding
 * @returns {{ id: string, name: string } | null}
 */
function resolveProfile(binding) {
    const profiles = getProfiles();
    if (binding.id) {
        const byId = profiles.find(p => p.id === binding.id);
        if (byId) {
            return byId;
        }
    }
    if (binding.name) {
        return profiles.find(p => p.name === binding.name) ?? null;
    }
    return null;
}

/**
 * @returns {HTMLSelectElement | null}
 */
function getSelect() {
    return /** @type {HTMLSelectElement | null} */ (document.getElementById(SELECT_ID));
}

/**
 * @returns {HTMLElement | null}
 */
function getLabel() {
    return document.getElementById(LABEL_ID);
}

function shouldShowSelect() {
    const ctx = getCtx();
    return ctx.menuType === 'character_edit' && ctx.characterId !== undefined && ctx.characterId !== null && ctx.characterId !== '';
}

function updateSelectVisibility() {
    const label = getLabel();
    if (!label) {
        return;
    }
    label.classList.toggle('hidden', !shouldShowSelect());
}

function populateSelect() {
    const select = getSelect();
    if (!select) {
        return;
    }

    const ctx = getCtx();
    const character = ctx.characters?.[ctx.characterId];
    const binding = getBinding(character);
    const profiles = getProfiles();
    const resolved = binding ? resolveProfile(binding) : null;

    suppressSelectChange = true;
    select.innerHTML = '';

    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = NONE_LABEL;
    select.appendChild(noneOption);

    for (const profile of profiles) {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name;
        select.appendChild(option);
    }

    if (resolved) {
        select.value = resolved.id;
    } else if (binding) {
        const missing = document.createElement('option');
        missing.value = binding.id || binding.name || '';
        missing.textContent = `${binding.name || binding.id} (missing)`;
        missing.disabled = true;
        select.appendChild(missing);
        select.value = missing.value;
    } else {
        select.value = '';
    }

    suppressSelectChange = false;
    updateSelectVisibility();
}

function injectSelect() {
    if (getSelect()) {
        return;
    }

    const moreLabel = document.querySelector('#avatar_controls label[for="char-management-dropdown"]');
    if (!moreLabel) {
        return;
    }

    const label = document.createElement('label');
    label.id = LABEL_ID;
    label.className = 'flex1 height100p hidden';
    label.htmlFor = SELECT_ID;

    const select = document.createElement('select');
    select.id = SELECT_ID;
    select.className = 'text_pole';
    select.setAttribute('title', NONE_LABEL);

    label.appendChild(select);
    moreLabel.insertAdjacentElement('afterend', label);

    select.addEventListener('change', onBoundProfileChange);
}

/**
 * @returns {Promise<void>}
 */
async function onBoundProfileChange() {
    if (suppressSelectChange) {
        return;
    }

    const select = getSelect();
    const ctx = getCtx();
    const characterId = ctx.characterId;
    if (!select || characterId === undefined || characterId === null || characterId === '') {
        return;
    }

    const value = select.value;
    if (!value) {
        await ctx.writeExtensionField(characterId, FIELD_KEY, ctx.constants.unset);
        return;
    }

    const profile = getProfiles().find(p => p.id === value);
    if (!profile) {
        return;
    }

    await ctx.writeExtensionField(characterId, FIELD_KEY, { id: profile.id, name: profile.name });
}

/**
 * Reuse one in-flight chat-completion status check per request body so
 * /profile's overlapping reconnects do not each download the OpenRouter catalog.
 */
function installStatusFetchCoalescer() {
    if (statusFetchCoalescerInstalled) {
        return;
    }
    statusFetchCoalescerInstalled = true;

    const originalFetch = window.fetch.bind(window);
    /** @type {Map<string, Promise<{buffer: ArrayBuffer, status: number, statusText: string, headers: Headers}>>} */
    const inflight = new Map();

    window.fetch = (input, init) => {
        const url = typeof input === 'string'
            ? input
            : (input instanceof URL ? input.href : input?.url);
        if (!url || !String(url).includes('/api/backends/chat-completions/status')) {
            return originalFetch(input, init);
        }

        const key = typeof init?.body === 'string' ? init.body : 'status';
        const existing = inflight.get(key);
        if (existing) {
            return existing.then(toStatusResponse);
        }

        const pending = originalFetch(input, init).then(async (response) => {
            const buffer = await response.arrayBuffer();
            return {
                buffer,
                status: response.status,
                statusText: response.statusText,
                headers: new Headers(response.headers),
            };
        }).finally(() => {
            inflight.delete(key);
        });

        inflight.set(key, pending);
        return pending.then(toStatusResponse);
    };
}

/**
 * @param {{buffer: ArrayBuffer, status: number, statusText: string, headers: Headers}} saved
 * @returns {Response}
 */
function toStatusResponse(saved) {
    return new Response(saved.buffer.slice(0), {
        status: saved.status,
        statusText: saved.statusText,
        headers: saved.headers,
    });
}

/**
 * @returns {boolean}
 */
function isApiConnected() {
    return getCtx().onlineStatus !== 'no_connection';
}

/**
 * @returns {boolean}
 */
function isStatusCheckInProgress() {
    if (document.querySelector('.api_button.disabled')) {
        return true;
    }
    const loading = document.querySelector('.api_loading');
    return !!(loading && window.getComputedStyle(loading).display !== 'none');
}

/**
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
async function waitForApiConnection(timeoutMs = CONNECT_TIMEOUT_MS) {
    if (isApiConnected()) {
        return true;
    }

    const { eventSource, eventTypes } = getCtx();

    return await new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
            if (settled) {
                return;
            }
            settled = true;
            clearInterval(pollId);
            clearTimeout(timeoutId);
            eventSource.removeListener(eventTypes.ONLINE_STATUS_CHANGED, onStatus);
            resolve(ok);
        };
        const onStatus = (status) => {
            if (status && status !== 'no_connection') {
                finish(true);
            }
        };
        const pollId = setInterval(() => {
            if (isApiConnected()) {
                finish(true);
            }
        }, 100);
        const timeoutId = setTimeout(() => finish(isApiConnected()), timeoutMs);
        eventSource.on(eventTypes.ONLINE_STATUS_CHANGED, onStatus);
    });
}

function triggerApiConnect() {
    const ctx = getCtx();
    const buttonIds = ctx.mainApi === 'openai'
        ? ['api_button_openai']
        : ['api_button', 'api_button_textgenerationwebui', 'api_button_kobold', 'api_button_novel'];

    for (const id of buttonIds) {
        const button = document.getElementById(id);
        if (button) {
            button.click();
            return;
        }
    }
}

/**
 * @returns {Promise<boolean>}
 */
async function ensureApiConnected() {
    if (isApiConnected()) {
        return true;
    }

    if (isStatusCheckInProgress()) {
        return waitForApiConnection(CONNECT_TIMEOUT_MS);
    }

    if (await waitForApiConnection(400)) {
        return true;
    }

    if (!isApiConnected() && !isStatusCheckInProgress()) {
        triggerApiConnect();
    }

    const connected = await waitForApiConnection(CONNECT_TIMEOUT_MS);
    if (!connected) {
        console.warn(`[${MODULE_NAME}] API did not connect after bound profile apply`);
    }
    return connected;
}

/**
 * @param {object} [character]
 * @returns {Promise<void>}
 */
function applyBoundProfileForCharacter(character) {
    applyQueue = applyQueue.then(() => applyBoundProfileForCharacterImpl(character)).catch((error) => {
        console.error(`[${MODULE_NAME}] Bound profile apply failed`, error);
    });
    return applyQueue;
}

/**
 * @param {object} [character]
 * @returns {Promise<void>}
 */
async function applyBoundProfileForCharacterImpl(character) {
    const binding = getBinding(character);
    if (!binding) {
        return;
    }

    const profile = resolveProfile(binding);
    if (!profile) {
        toastr.warning(`Bound connection profile not found: ${binding.name || binding.id}`);
        return;
    }

    const selectedId = getCtx().extensionSettings?.connectionManager?.selectedProfile;
    if (selectedId === profile.id) {
        await ensureApiConnected();
        return;
    }

    try {
        await getCtx().executeSlashCommandsWithOptions(
            `/profile await=true timeout=0 ${quoteSlashArg(profile.name)}`,
            { handleExecutionErrors: true, source: MODULE_NAME },
        );
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to apply bound profile`, error);
        toastr.warning(`Failed to apply bound connection profile: ${profile.name}`);
    }

    const connected = await ensureApiConnected();
    if (!connected) {
        toastr.warning(`Bound connection profile applied, but API did not connect: ${profile.name}`);
    }
}

/**
 * @returns {Promise<void>}
 */
async function onChatChanged() {
    const ctx = getCtx();
    if (ctx.groupId) {
        populateSelect();
        return;
    }

    const character = ctx.characters?.[ctx.characterId];
    await applyBoundProfileForCharacter(character);
    populateSelect();
}

/**
 * @param {number|string} chId
 * @returns {Promise<void>}
 */
async function onGroupMemberDrafted(chId) {
    const ctx = getCtx();
    const character = ctx.characters?.[chId];
    await applyBoundProfileForCharacter(character);
}

function onCharacterEditorOpened() {
    populateSelect();
}

function observeMenuType() {
    const panel = document.getElementById('right-nav-panel');
    if (!panel || panel.dataset.stCbpMenuObserver === '1') {
        return;
    }

    panel.dataset.stCbpMenuObserver = '1';
    const observer = new MutationObserver(() => {
        populateSelect();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['data-menu-type'] });
}

function setupUi() {
    injectSelect();
    observeMenuType();
    populateSelect();
}

export function init() {
    installStatusFetchCoalescer();
    setupUi();

    const { eventSource, eventTypes } = getCtx();
    eventSource.on(eventTypes.APP_READY, setupUi);
    eventSource.on(eventTypes.CHAT_CHANGED, onChatChanged);
    eventSource.on(eventTypes.GROUP_MEMBER_DRAFTED, onGroupMemberDrafted);
    eventSource.on(eventTypes.CHARACTER_EDITOR_OPENED, onCharacterEditorOpened);
    eventSource.on(eventTypes.CHARACTER_PAGE_LOADED, populateSelect);
    eventSource.on(eventTypes.CONNECTION_PROFILE_CREATED, populateSelect);
    eventSource.on(eventTypes.CONNECTION_PROFILE_DELETED, populateSelect);
    eventSource.on(eventTypes.CONNECTION_PROFILE_UPDATED, populateSelect);
}
