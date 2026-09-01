const MODULE_NAME = 'st-character-bound-preset';
const FIELD_KEY = 'bound_connection_profile';
const SELECT_ID = 'st-cbp-bound-profile';
const LABEL_ID = 'st-cbp-bound-profile-label';
const NONE_LABEL = 'Bound profile';

/** @type {boolean} */
let suppressSelectChange = false;
/** @type {boolean} */
let applyingProfile = false;

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
 * @param {object} [character]
 * @returns {Promise<void>}
 */
async function applyBoundProfileForCharacter(character) {
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
        return;
    }

    if (applyingProfile) {
        return;
    }

    applyingProfile = true;
    try {
        await getCtx().executeSlashCommandsWithOptions(
            `/profile await=true ${quoteSlashArg(profile.name)}`,
            { handleExecutionErrors: true, source: MODULE_NAME },
        );
    } catch (error) {
        console.error(`[${MODULE_NAME}] Failed to apply bound profile`, error);
        toastr.warning(`Failed to apply bound connection profile: ${profile.name}`);
    } finally {
        applyingProfile = false;
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
