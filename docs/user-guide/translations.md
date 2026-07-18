# Translations

English is canonical. The Agent uses the `openpreflight` text domain and ships a
POT template. Generate PO/MO files with WordPress tooling; never concatenate
translatable sentences. Dashboard messages are isolated in UI modules for a
future locale catalog, use `Intl` for dates/numbers, and honor document `dir`.
Test translated strings for expansion, keyboard use, and RTL layout.
