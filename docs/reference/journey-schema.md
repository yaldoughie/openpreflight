# Journey schema reference

Canonical schema: `packages/journey-schema/schemas/journey.schema.json`.

Steps: `visit`, `click`, `doubleClick`, `fill`, `clear`, `select`, `check`,
`uncheck`, `press`, `hover`, `focus`, `upload`, `waitFor`, `waitForResponse`,
`waitForRequest`, `expect`, `screenshot`, `setCookie`, `clearCookies`,
`loginAsWordPressUser`, `logout`, `addWooCommerceProductToCart`,
`assertCartCount`, `assertNoPhpFatal`, `assertNoConsoleErrors`,
`assertNoFailedRequests`, `assertPaymentMethodsAvailable`, and
`assertShippingMethodsAvailable`.

Locators: role, label, placeholder, text, title, alt, testId, name, CSS, XPath.
Role targets may pair `role` with an accessible `name`. Every step object has
exactly one operation. Ordinary journey definitions cannot evaluate JavaScript.
