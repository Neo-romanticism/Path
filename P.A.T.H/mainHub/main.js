function bindTapAction(el, handler) {
    if (!el.hasAttribute('onclick')) {
        el.addEventListener('click', handler);
    }
    // existing duplicate/tap suppression logic
}

function bindMainHubSettingsPanelControls() {
    // no longer removing inline event handlers
    // no longer adding JS change listeners for theme/minimap/keyboard-guide/coordinates/cam controls
    // keep explicit tap bindings for the settings panel close button and logout button if needed
    // ensure not rebinding the settings button, handled by bindMainHubPrimaryButtons
}

function saveCamSettings() {
    fetch('/path/to/api', {...})
        .then(response => {
            if (!response.ok) {
                throw new Error('Network response was not ok');
            }
            return response.json();
        })
        .then(data => {
            // show success note only if POST succeeds
        })
        .catch((error) => {
            alert('Error: ' + error.message);
        });
}