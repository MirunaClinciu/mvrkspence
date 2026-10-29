(function improveWebsiteEditor() {
    'use strict';
    const help = document.getElementById('manager-context');
    const mediaButton = document.getElementById('manager-images');
    const message = document.getElementById('manager-message');
    let requestedImages = new URLSearchParams(window.location.search).get('task') === 'images';
    let scheduled = false;

    function stockMediaButton() {
        return [...document.querySelectorAll('#nc-root header button')]
            .find(button => !button.disabled && button.textContent.trim() === 'Media');
    }
    function openImages() {
        const button = stockMediaButton();
        if (!button) {
            message.textContent = 'Sign in and wait for the editor to finish loading, then choose Image library.';
            document.querySelector('.manager-help').open = true;
            return false;
        }
        button.click();
        message.textContent = 'Upload adds an image to your library. Choose it in an image field to use it on a page. Delete selected removes a library file, including from pages that use it.';
        return true;
    }
    mediaButton.addEventListener('click', openImages);

    function labelButton(button, text) {
        let label = button.querySelector('.manager-action-label');
        if (!label) {
            label = document.createElement('span');
            label.className = 'manager-action-label';
            label.setAttribute('aria-hidden', 'true');
            button.append(label);
        }
        if (label.textContent !== text) label.textContent = text;
    }
    function improveControls() {
        // These are Decap 3.8.3's sortable list-item action bars. Keep all
        // existing React handlers; add text and accessible names only.
        for (const handle of document.querySelectorAll('#nc-root [aria-roledescription="sortable"]')) {
            const bar = handle.parentElement;
            const buttons = [...bar.children].filter(child => child.tagName === 'BUTTON');
            if (buttons.length !== 2 || !buttons.every(button => button.querySelector('svg'))) continue;
            if (!bar.classList.contains('manager-item-actions')) bar.classList.add('manager-item-actions');
            const collapsedLabel = bar.nextElementSibling;
            const collapsed = collapsedLabel && window.getComputedStyle(collapsedLabel).display !== 'none';
            const itemName = collapsedLabel && collapsedLabel.textContent.trim().slice(0, 100);
            labelButton(buttons[0], collapsed ? 'Edit' : 'Collapse');
            const expanded = String(!collapsed);
            if (buttons[0].getAttribute('aria-expanded') !== expanded) buttons[0].setAttribute('aria-expanded', expanded);
            const toggleLabel = `${collapsed ? 'Edit' : 'Collapse'} ${itemName || 'item'}`;
            if (buttons[0].getAttribute('aria-label') !== toggleLabel) buttons[0].setAttribute('aria-label', toggleLabel);
            labelButton(buttons[1], 'Remove');
            if (!buttons[1].classList.contains('manager-remove')) buttons[1].classList.add('manager-remove');
            const removeLabel = `Remove ${itemName || 'item'} from this page`;
            if (buttons[1].getAttribute('aria-label') !== removeLabel) buttons[1].setAttribute('aria-label', removeLabel);
            if (handle.getAttribute('aria-label') !== 'Drag to reorder this item') handle.setAttribute('aria-label', 'Drag to reorder this item');
        }
        for (const dialog of document.querySelectorAll('[role="dialog"]')) {
            if (!dialog.classList.contains('manager-media-dialog') && [...dialog.querySelectorAll('h1,h2,h3')].some(heading => heading.textContent.trim() === 'Media assets')) dialog.classList.add('manager-media-dialog');
        }
        const hash = window.location.hash;
        const context = hash.includes('/entries/shop') ? 'Artwork: add a photograph, enter its title and choose an image. Edit the prepared formats and prices. Items per shop page controls when visitors use Next. Remove deletes a listing; switching Show off keeps it for later.'
            : hash.includes('/entries/policies') ? 'Shop policies: complete seller and delivery details, then review each policy. Open a section to edit its paragraphs or payment picture. Keep Policies are still a draft on until the wording is ready. Save and publish to update the policy page.'
            : hash.includes('/entries/books') ? 'Books: add a book, enter its title and choose a cover. Set its price or leave checkout off for enquiries. References are created automatically.'
            : hash.includes('/entries/home') ? 'Homepage: open an image item to replace its picture or destination. Add another image, drag to reorder, or use Remove to take an item off the page.'
            : hash.includes('/entries/concept') ? 'Concept & journal: edit the page text, gallery or posts. Add and remove pictures using their fields or list items. Post references are created automatically.'
            : 'Choose what you want to edit. Add and Remove change a list; image fields let you choose or replace a picture. No coding or product references are needed.';
        if (help.textContent !== context) help.textContent = context;
        if (requestedImages && stockMediaButton()) {
            requestedImages = false;
            const url = new URL(window.location.href);
            url.searchParams.delete('task');
            window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
            openImages();
        }
    }
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(() => { scheduled = false; improveControls(); });
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled'] });
    window.addEventListener('hashchange', improveControls);
    improveControls();
})();
