import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, runInContext } from 'node:vm';

const source = readFileSync(new URL('../admin/preview.js', import.meta.url), 'utf8');

function preview(data, getAsset = path => ({ toString: () => path })) {
    const templates = {};
    const CMS = {
        registerPreviewStyle() {},
        registerPreviewTemplate(name, component) { templates[name] = component; }
    };
    const context = createContext({
        URL,
        CMS,
        window: {
            CMS,
            location: { origin: 'https://portfolio.example' },
            h: (tag, props, ...children) => ({ tag, props, children: children.flat(Infinity).filter(Boolean) })
        }
    });
    runInContext(source, context);
    return templates.home({ entry: { getIn: () => ({ toJS: () => data }) }, getAsset });
}

function images(element) {
    return typeof element !== 'object' ? [] : [
        ...(element.tag === 'img' ? [element] : []),
        ...element.children.flatMap(images)
    ];
}

test('bundled images resolve from the site root inside the admin preview iframe', () => {
    const data = { cards: [
        { image: 'stuff/img/Book1.png', title: 'Book' },
        { image: './stuff/img/Artwork.png', title: 'Artwork' },
        { image: '/uploads/photo with spaces.png', title: 'New photo' }
    ] };
    assert.deepEqual(images(preview(data)).map(image => image.props.src), [
        '/stuff/img/Book1.png', '/stuff/img/Artwork.png', '/uploads/photo%20with%20spaces.png'
    ]);
});

test('new upload preview URLs remain intact and unresolved assets fall back to the public file', () => {
    const data = { cards: [{ image: '/uploads/new-photo.png', title: 'New photo' }] };
    for (const url of ['blob:https://portfolio.example/new-photo', 'data:image/png;base64,sample', 'https://images.example/photo.png']) {
        const result = preview(data, () => ({ toString: () => url }));
        assert.equal(images(result)[0].props.src, url);
    }
    assert.equal(images(preview(data, () => null))[0].props.src, '/uploads/new-photo.png');
});

test('non-image executable URL schemes are rejected by the preview asset helper', () => {
    const data = { cards: [{ image: 'javascript:alert(1)', title: 'Invalid image' }] };
    assert.equal(images(preview(data))[0].props.src, '');
});
