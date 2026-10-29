(function () {
    'use strict';

    let activeViewer = null;
    let viewerId = 0;
    const previewFormats = new Set(['print', 'framed', 'canvas', 'tshirt']);

    function safeImageUrl(value) {
        if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) return '';
        try {
            const page = new URL(window.location.href);
            const url = new URL(value, document.baseURI || page.href);
            return /^https?:$/.test(url.protocol) && url.origin === page.origin && !url.username && !url.password
                ? url.href : '';
        } catch (error) {
            return '';
        }
    }

    function text(value) {
        return typeof value === 'string' ? value : '';
    }

    function element(tag, className, label) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (label !== undefined) node.textContent = label;
        return node;
    }

    function button(label, className) {
        const node = element('button', className, label);
        node.type = 'button';
        return node;
    }

    function rememberOverflow(node) {
        return { node, value: node.style.getPropertyValue('overflow'), priority: node.style.getPropertyPriority('overflow') };
    }

    function finish(viewer, restoreFocus = viewer.restoreFocus !== false) {
        if (activeViewer !== viewer) return;
        activeViewer = null;
        viewer.image = null;
        viewer.overflow.forEach(({ node, value, priority }) => {
            if (value) node.style.setProperty('overflow', value, priority);
            else node.style.removeProperty('overflow');
        });
        viewer.dialog.remove();
        if (restoreFocus && viewer.trigger && viewer.trigger.isConnected && typeof viewer.trigger.focus === 'function') {
            viewer.trigger.focus({ preventScroll: true });
        }
    }

    function closeViewer(restoreFocus = true) {
        const viewer = activeViewer;
        if (!viewer) return;
        viewer.restoreFocus = restoreFocus;
        if (viewer.dialog.open && typeof viewer.dialog.close === 'function') {
            try { viewer.dialog.close(); } catch (error) { /* Cleanup also works if a browser cannot close the dialog. */ }
        }
        finish(viewer, restoreFocus);
    }

    function openOriginal(url) {
        if (typeof window.open === 'function') window.open(url, '_blank', 'noopener,noreferrer');
        return false;
    }

    function createViewer(config, imageUrl, originalUrl) {
        const id = ++viewerId;
        const dialog = element('dialog', 'mvrk-product-image-viewer');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', `mvrk-product-image-title-${id}`);
        const shell = element('div', 'mvrk-product-image-shell');
        const header = element('div', 'mvrk-product-image-header');
        const headingGroup = element('div', 'mvrk-product-image-heading');
        const heading = element('h2', '', text(config.title) || 'Artwork detail');
        heading.id = `mvrk-product-image-title-${id}`;
        const details = element('p', 'mvrk-product-image-details');
        const variant = text(config.variantLabel) || [text(config.format), text(config.color), text(config.option)].filter(Boolean).join(' · ');
        const variantNode = element('span', 'mvrk-product-image-variant', variant);
        const priceNode = element('span', 'mvrk-product-image-price', text(config.priceText));
        variantNode.hidden = !variant;
        priceNode.hidden = !priceNode.textContent;
        details.append(variantNode, priceNode);
        details.hidden = !variant && !priceNode.textContent;
        headingGroup.append(heading, details);
        const closeButton = button('Close', 'mvrk-product-image-close');
        closeButton.autofocus = true;
        closeButton.setAttribute('aria-label', 'Close image viewer');
        header.append(headingGroup, closeButton);

        const toolbar = element('div', 'mvrk-product-image-toolbar');
        const views = element('div', 'mvrk-product-image-views');
        views.setAttribute('role', 'group');
        views.setAttribute('aria-label', 'Image view');
        const hasPreview = previewFormats.has(text(config.format));
        const previewButton = button('Product preview', 'mvrk-product-image-view-button');
        previewButton.hidden = !hasPreview;
        const originalButton = button(hasPreview ? 'Original artwork' : 'Original image', 'mvrk-product-image-view-button');
        const zoomButton = button('Zoom in', 'mvrk-product-image-zoom');
        zoomButton.setAttribute('aria-pressed', 'false');
        views.append(previewButton, originalButton);
        toolbar.append(views, zoomButton);

        const stage = element('div', 'mvrk-product-image-stage');
        stage.id = `mvrk-product-image-stage-${id}`;
        stage.tabIndex = 0;
        stage.setAttribute('role', 'region');
        stage.setAttribute('aria-label', 'Image viewing area. Scroll to explore when zoomed in.');
        [previewButton, originalButton, zoomButton].forEach(control => control.setAttribute('aria-controls', stage.id));
        const footer = element('div', 'mvrk-product-image-footer');
        const description = element('p', 'mvrk-product-image-description');
        const resolution = element('p', 'mvrk-product-image-resolution');
        resolution.setAttribute('role', 'status');
        resolution.setAttribute('aria-live', 'polite');
        resolution.setAttribute('aria-atomic', 'true');
        const originalLink = element('a', 'mvrk-product-image-original-link', 'Open original image');
        originalLink.href = originalUrl;
        originalLink.target = '_blank';
        originalLink.rel = 'noopener noreferrer';
        footer.append(description, resolution, originalLink);
        shell.append(header, toolbar, stage, footer);
        dialog.append(shell);

        const viewer = {
            dialog, trigger: config.trigger || document.activeElement,
            overflow: [], image: null, view: '', zoomed: false, originalUrl,
            originalAlt: safeImageUrl(config.detailImage) === originalUrl ? text(config.detailImageAlt) || text(config.imageAlt) : text(config.imageAlt)
        };

        function setZoom(zoomed) {
            const image = viewer.image;
            viewer.zoomed = zoomed && viewer.view === 'original' && image && image.naturalWidth > 0;
            stage.classList.toggle('is-zoomed', Boolean(viewer.zoomed));
            zoomButton.textContent = viewer.zoomed ? 'Zoom out' : 'Zoom in';
            zoomButton.setAttribute('aria-pressed', String(Boolean(viewer.zoomed)));
            zoomButton.setAttribute('aria-label', viewer.zoomed ? 'Zoom out to fit image' : 'Zoom in to original size (100%)');
            if (image) {
                if (viewer.zoomed) {
                    image.style.width = `${image.naturalWidth}px`;
                    image.style.height = `${image.naturalHeight}px`;
                } else {
                    image.style.removeProperty('width');
                    image.style.removeProperty('height');
                }
            }
            stage.scrollLeft = 0;
            stage.scrollTop = 0;
        }

        function render(view, source = view === 'original' ? viewer.originalUrl : imageUrl) {
            viewer.view = view;
            const isOriginal = view === 'original';
            previewButton.setAttribute('aria-pressed', String(!isOriginal));
            originalButton.setAttribute('aria-pressed', String(isOriginal));
            zoomButton.hidden = !isOriginal;
            zoomButton.disabled = true;
            resolution.textContent = 'Loading image…';
            description.textContent = isOriginal
                ? 'Original source image. Zoom to 100% to inspect the available detail.'
                : 'Illustrative product preview. Product appearance and artwork placement are approximate.';
            const image = element('img', isOriginal ? 'mvrk-product-image-original' : 'product-mockup-image');
            image.alt = (isOriginal ? viewer.originalAlt : text(config.imageAlt)) || text(config.title) || 'Artwork';
            image.decoding = 'async';
            image.draggable = false;
            viewer.image = image;
            setZoom(false);
            if (isOriginal) {
                const frame = element('div', 'mvrk-product-image-original-frame');
                frame.append(image);
                stage.replaceChildren(frame);
            } else {
                const preview = element('figure', 'product-mockup mvrk-product-image-preview');
                preview.dataset.format = text(config.format);
                preview.dataset.color = text(config.color);
                const surface = element('div', 'product-mockup-surface');
                surface.append(image);
                preview.append(surface, element('figcaption', 'product-mockup-caption', 'Illustrative product preview'));
                stage.replaceChildren(preview);
            }
            function isCurrentImage() {
                return activeViewer === viewer && viewer.image === image;
            }
            function loaded() {
                if (!isCurrentImage() || !image.naturalWidth || !image.naturalHeight) return;
                resolution.textContent = `${image.naturalWidth} × ${image.naturalHeight} px${isOriginal ? ' · Original source resolution' : ' · Artwork source resolution'}`;
                zoomButton.disabled = !isOriginal;
            }
            image.addEventListener('load', loaded);
            image.addEventListener('error', () => {
                if (!isCurrentImage()) return;
                if (isOriginal && source !== imageUrl) {
                    viewer.originalUrl = imageUrl;
                    viewer.originalAlt = text(config.imageAlt);
                    originalLink.href = imageUrl;
                    render('original', imageUrl);
                    return;
                }
                resolution.textContent = 'This image could not be loaded. Try opening the original image.';
                zoomButton.disabled = true;
            });
            image.src = source;
            if (image.complete) loaded();
        }

        previewButton.addEventListener('click', () => { if (hasPreview) render('preview'); });
        originalButton.addEventListener('click', () => render('original'));
        zoomButton.addEventListener('click', () => { if (!zoomButton.disabled) setZoom(!viewer.zoomed); });
        closeButton.addEventListener('click', () => closeViewer());
        dialog.addEventListener('keydown', event => {
            if (activeViewer !== viewer || event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
            const controls = [...dialog.querySelectorAll('button:not(:disabled), a[href], [tabindex="0"]')]
                .filter(control => !control.hidden && !control.disabled && control.getClientRects().length > 0);
            if (!controls.length) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            const focused = document.activeElement;
            if (!controls.includes(focused) || (event.shiftKey ? focused === first : focused === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus({ preventScroll: true });
            }
        });
        dialog.addEventListener('cancel', event => {
            event.preventDefault();
            if (activeViewer === viewer) closeViewer();
        });
        dialog.addEventListener('close', () => finish(viewer));
        let pressedBackdrop = false;
        function outsideDialog(event) {
            const bounds = dialog.getBoundingClientRect();
            return event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
        }
        dialog.addEventListener('pointerdown', event => { pressedBackdrop = outsideDialog(event); });
        dialog.addEventListener('click', event => {
            if (pressedBackdrop && outsideDialog(event) && activeViewer === viewer) closeViewer();
            pressedBackdrop = false;
        });
        viewer.render = () => render(hasPreview ? 'preview' : 'original');
        return viewer;
    }

    function open(config) {
        if (!config || typeof config !== 'object' || !document.body) return false;
        const imageUrl = safeImageUrl(config.image) || safeImageUrl(config.detailImage);
        const originalUrl = safeImageUrl(config.detailImage) || imageUrl;
        if (!imageUrl || !originalUrl) return false;
        const viewer = createViewer(config, imageUrl, originalUrl);
        closeViewer(false);
        if (typeof viewer.dialog.showModal !== 'function' || typeof viewer.dialog.close !== 'function') return openOriginal(originalUrl);
        activeViewer = viewer;
        viewer.overflow = [document.documentElement, document.body].map(rememberOverflow);
        viewer.overflow.forEach(({ node }) => node.style.setProperty('overflow', 'hidden'));
        document.body.append(viewer.dialog);
        try {
            viewer.render();
            viewer.dialog.showModal();
            return true;
        } catch (error) {
            finish(viewer);
            return openOriginal(originalUrl);
        }
    }

    window.MvrkProductImages = { open, close: () => closeViewer() };
}());
