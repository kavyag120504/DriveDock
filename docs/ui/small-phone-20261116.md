# Small-phone layout fix - 16 November 2026

The Pixel 4a photos showed a fixed workspace header taking much of the screen, a garage count breaking inside a word, narrow three-column metrics, clipped action icons and abbreviated tab names.

The UI now chooses spacing and column layout from the available width, height and system font scale. Workspace headings scroll away with their page. Narrow cards use full-width actions, document/challan metrics reflow, and the region has a full-width line. The garage title no longer competes with a decorative icon at narrow widths. Short navigation labels fit the five owner tabs; full accessibility labels remain available. Navigation-label scaling is bounded separately from body text. Body text retains system font scaling.

The compact pilot banner retains student-pilot, synthetic-data and test-payment wording, with the complete build label available to accessibility services. Provider date fields and tight choice controls adapt to the available text space. Scanner permission content can grow rather than being clipped by a fixed height.

Validation:

- Mobile and server TypeScript checks passed.
- Five responsive regression checks passed with Node's built-in test runner. These cover narrow/short screens, font scales 1.3, 1.6 and 2.0, larger displays and orientation changes. They now run in the mobile CI job.
- Android and web bundle export passed during implementation.
- Expo Doctor: 19/20 checks passed. The existing package-version mismatch check still reports 17 packages; no dependency or lockfile upgrades were made.
- Browser visual checks used synthetic local fixtures at 320x568, 360x640 and 393x851. They included five vehicles, Gurugram/West Delhi regions, reminders, header scrolling, full-width actions, provider navigation and stacked inspection dates, and scanner permission guidance. At 320 pixels, measured action width equaled available card width (262 pixels).

API calls, authentication state, payment logic, backend/deployment configuration and the existing free-map implementation were preserved. The original deployment checkout and its uncommitted changes were left untouched. No user photos are committed.

The screenshots are web previews. Physical Pixel 4a installation, native font rendering, keyboard and camera testing still need confirmation on the phone.
