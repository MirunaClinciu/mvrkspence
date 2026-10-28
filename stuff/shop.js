const basketStorageKey = 'mvrk-shopping-basket';
const cartItemsContainer = document.getElementById('cart-items-container');
const cartTotalAmount = document.getElementById('cart-total-amount');
const cartStatus = document.getElementById('cart-status');
const clearBasketButton = document.getElementById('clear-basket-btn');
const paypalButtonsContainer = document.getElementById('paypal-buttons');

let paypalButtonsLoading = false;
let paypalButtonsRendered = false;

function getBasket() {
    try {
        const basket = JSON.parse(localStorage.getItem(basketStorageKey) || '{}');
        if (!basket || typeof basket !== 'object' || Array.isArray(basket)) {
            throw new Error('The saved basket has an invalid format.');
        }
        return basket;
    } catch (error) {
        console.error('Could not read the saved basket.', error);
        try {
            localStorage.removeItem(basketStorageKey);
        } catch (storageError) {
            console.error('Could not clear the unreadable basket from browser storage.', storageError);
        }
        showCartStatus('Your saved basket could not be read and has been cleared. Please add your items again.');
        return {};
    }
}

function saveBasket(basket) {
    try {
        localStorage.setItem(basketStorageKey, JSON.stringify(basket));
        return true;
    } catch (error) {
        console.error('Could not save the shopping basket.', error);
        showCartStatus('Your basket could not be saved in this browser. Check your storage settings and try again.');
        return false;
    }
}

function showCartStatus(message, isError = false) {
    if (!cartStatus) return;
    cartStatus.textContent = message;
    cartStatus.classList.toggle('is-error', isError);
}

function getCurrentProduct(productId) {
    return (window.siteProducts || []).find(product => product.id === productId);
}

function reconcileBasket() {
    const basket = getBasket();
    if (!window.siteReady) return basket;
    let changed = false;
    Object.keys(basket).forEach(productId => {
        const product = getCurrentProduct(productId);
        if (!product || product.available === false) {
            delete basket[productId];
            changed = true;
            return;
        }
        if (
            basket[productId].name !== product.name ||
            Number(basket[productId].price) !== Number(product.price)
        ) {
            basket[productId].name = product.name;
            basket[productId].price = Number(product.price);
            changed = true;
        }
    });
    if (changed) saveBasket(basket);
    return basket;
}

function updateBasketCount() {
    const basket = getBasket();
    const count = Object.values(basket).reduce((total, item) => {
        return total + (Number.isInteger(item.quantity) ? item.quantity : 0);
    }, 0);
    const countElement = document.getElementById('nav-cart-count-root');
    if (!countElement) return;
    countElement.textContent = String(count);
    countElement.hidden = count === 0;
    countElement.setAttribute('aria-label', `${count} items in basket`);
}

function renderBasket() {
    if (!cartItemsContainer || !cartTotalAmount) return;
    const basket = reconcileBasket();
    cartItemsContainer.replaceChildren();
    const items = Object.entries(basket);
    paypalButtonsContainer.hidden = items.length === 0;
    let total = 0;

    if (items.length === 0) {
        cartItemsContainer.append(makeElement('p', 'basket-empty', 'Your basket is empty.'));
    } else {
        items.forEach(([productId, item]) => {
            const row = makeElement('div', 'cart-item');
            const detail = makeElement('div', 'cart-item-details');
            detail.append(
                makeElement('strong', '', item.name),
                makeElement('span', '', `${formatMoney(item.price)} each`)
            );
            const controls = makeElement('div', 'quantity-controls');
            const decrease = makeElement('button', 'quantity-btn', '−');
            decrease.type = 'button';
            decrease.setAttribute('aria-label', `Remove one ${item.name}`);
            decrease.dataset.quantityChange = '-1';
            decrease.dataset.productId = productId;
            const quantity = makeElement('span', 'item-quantity', String(item.quantity));
            const increase = makeElement('button', 'quantity-btn', '+');
            increase.type = 'button';
            increase.setAttribute('aria-label', `Add one ${item.name}`);
            increase.dataset.quantityChange = '1';
            increase.dataset.productId = productId;
            controls.append(decrease, quantity, increase);
            row.append(detail, controls);
            cartItemsContainer.append(row);
            total += Number(item.price) * item.quantity;
        });
    }

    cartTotalAmount.textContent = formatMoney(total);
    clearBasketButton.disabled = items.length === 0;
    updateBasketCount();
}

function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function formatMoney(value) {
    const currency = window.siteConfig && window.siteConfig.currency;
    try {
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: typeof currency === 'string' ? currency : 'USD'
        }).format(Number(value));
    } catch (error) {
        console.error('Could not format the basket currency.', error);
        return `${Number(value).toFixed(2)} ${currency || 'USD'}`;
    }
}

function addToBasket(productId) {
    const product = getCurrentProduct(productId);
    if (!product || product.available === false || !Number.isFinite(Number(product.price))) {
        showCartStatus('That item is no longer available. Please refresh the page.', true);
        return;
    }

    const basket = getBasket();
    const quantity = basket[productId] ? basket[productId].quantity : 0;
    if (quantity >= 10) {
        showCartStatus('A maximum of 10 of each item can be added to your basket.', true);
        return;
    }
    basket[productId] = {
        name: product.name,
        price: Number(product.price),
        quantity: quantity + 1
    };
    if (saveBasket(basket)) {
        showCartStatus(`${product.name} added to your basket.`);
        renderBasket();
    }
}

function changeQuantity(productId, change) {
    const basket = getBasket();
    if (!basket[productId]) return;
    const quantity = basket[productId].quantity + change;
    if (quantity <= 0) delete basket[productId];
    else if (quantity <= 10) basket[productId].quantity = quantity;
    else {
        showCartStatus('A maximum of 10 of each item can be added to your basket.', true);
        return;
    }
    if (saveBasket(basket)) renderBasket();
}

async function postJson(path, data) {
    const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) {
        throw new Error(result.error || `Payment request failed (${response.status}).`);
    }
    return result;
}

function getCheckoutItems() {
    const basket = reconcileBasket();
    return Object.entries(basket).map(([id, item]) => ({
        id,
        quantity: item.quantity
    }));
}

function renderPayPalButtons() {
    if (paypalButtonsRendered || paypalButtonsLoading || !paypalButtonsContainer) return;
    if (Object.keys(reconcileBasket()).length === 0) return;
    const rawClientId = window.siteConfig && window.siteConfig.paypalClientId;
    const clientId = typeof rawClientId === 'string' ? rawClientId.trim() : '';
    const currency = window.siteConfig && window.siteConfig.currency;
    if (!clientId) {
        showCartStatus('PayPal checkout is not set up yet. Add the PayPal client ID in the site admin.');
        return;
    }
    if (!/^[A-Z]{3}$/.test(currency || '')) {
        showCartStatus('The shop currency must be a valid three-letter currency code.', true);
        return;
    }

    paypalButtonsLoading = true;
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture`;
    script.async = true;
    script.onload = () => {
        paypalButtonsLoading = false;
        if (!window.paypal || typeof window.paypal.Buttons !== 'function') {
            showCartStatus('PayPal could not be loaded. Please try again later.', true);
            return;
        }
        const buttons = window.paypal.Buttons({
            createOrder: async () => {
                const items = getCheckoutItems();
                if (!items.length) throw new Error('Your basket is empty.');
                const result = await postJson('/.netlify/functions/paypal-create-order', { items });
                if (!result.id) throw new Error('PayPal did not return an order ID.');
                return result.id;
            },
            onApprove: async data => {
                showCartStatus('Confirming your payment with PayPal…');
                const result = await postJson('/.netlify/functions/paypal-capture-order', {
                    orderId: data.orderID
                });
                if (result.status !== 'COMPLETED') {
                    throw new Error('PayPal has not confirmed this payment. Your basket has been kept.');
                }
                if (saveBasket({})) {
                    renderBasket();
                    showCartStatus('Payment complete. Thank you for your order.');
                } else {
                    showCartStatus('Payment complete. Please clear the saved basket before placing another order.');
                }
            },
            onCancel: () => showCartStatus('Checkout was cancelled. Your basket is still saved.'),
            onError: error => {
                console.error('PayPal checkout failed.', error);
                showCartStatus(error.message || 'PayPal checkout failed. Please try again.', true);
            }
        });
        if (buttons.isEligible()) {
            buttons.render(paypalButtonsContainer).then(() => {
                paypalButtonsRendered = true;
            }).catch(error => {
                console.error('PayPal buttons could not be rendered.', error);
                showCartStatus('PayPal checkout could not be started. Please try again later.', true);
            });
        } else {
            showCartStatus('PayPal checkout is not available for this browser or account.', true);
        }
    };
    script.onerror = () => {
        paypalButtonsLoading = false;
        showCartStatus('Could not connect to PayPal. Check your connection and try again.', true);
    };
    document.head.append(script);
}

document.addEventListener('click', event => {
    const addButton = event.target.closest('.add-to-basket-btn');
    if (addButton) {
        addToBasket(addButton.dataset.productId);
        return;
    }

    const quantityButton = event.target.closest('[data-quantity-change]');
    if (quantityButton) {
        changeQuantity(quantityButton.dataset.productId, Number(quantityButton.dataset.quantityChange));
    }
});

clearBasketButton.addEventListener('click', () => {
    if (saveBasket({})) {
        showCartStatus('Your basket has been cleared.');
        renderBasket();
    }
});

window.addEventListener('basket:open', () => {
    renderBasket();
    renderPayPalButtons();
});

window.addEventListener('site:ready', () => {
    renderBasket();
    if (document.getElementById('shopping-cart-modal').classList.contains('show')) {
        renderPayPalButtons();
    }
});

renderBasket();
