# ThriveMap Search Motion Polish Design

**Date:** 2026-08-20
**Status:** Approved design, pending implementation plan

## Objective

Add a restrained motion layer to the clinic discovery experience so state changes feel connected and understandable without increasing sensory load. Motion must support orientation, never delay a task, and become effectively immediate when either the operating system or ThriveMap's Display preferences request reduced motion.

## Scope

This pass covers three interactions only:

1. Showing and hiding the desktop map.
2. Selecting a clinic and presenting its contextual map preview.
3. Reflowing visible clinic cards after filters change the results.

Page transitions, animated map pins, scroll-linked motion, parallax, staggered card entrances, decorative loops, typewriter effects, and unrelated surfaces are out of scope.

## Motion Character

The selected direction is **calm and direct**:

- No bounce, overshoot, or elastic springs.
- Durations stay between 160 and 220 milliseconds.
- Use the existing calm easing curve, `[0.22, 0.61, 0.36, 1]`.
- Animations remain interruptible and never block input.
- State remains clear without animation through text, borders, ARIA state, and layout.

## Architecture

Motion remains component-local. Each interaction owns the animation closest to the state it represents, while the existing `MotionProvider` supplies lazy-loaded Motion features and the global reduced-motion policy.

Shared constants live in a small search motion module so timing and easing do not drift between components. This module contains values only; it does not coordinate state or introduce a global animation controller.

The implementation uses the existing `motion/react` dependency and `m` components under `LazyMotion`. No Motion+ package or additional runtime dependency is required.

## Interaction Design

### Desktop map visibility

The search shell continues to use `desktopMapOpen` as the source of truth.

- When hiding the map, the map region fades to transparent over 160 milliseconds before leaving the desktop layout.
- The results region expands into the released space over 200 milliseconds.
- When showing the map, the grid settles over 200 milliseconds and the map fades in over 160 milliseconds.
- The Show map and Hide map controls remain immediately interactive throughout the transition.
- The map remains unmounted or hidden according to the existing product behavior; motion must not create an extra MapLibre instance.

Reduced motion makes the layout and opacity changes immediate.

### Clinic selection

The selected clinic card keeps its existing border and `aria-current` treatment.

- The border/background emphasis transitions over 160 milliseconds.
- The contextual map preview enters with opacity only over 160 milliseconds. It does not slide across the map.
- Replacing one selected clinic with another crossfades the preview content without showing two actionable previews at once.
- Closing the preview fades it out over 140–160 milliseconds, then clears it.
- Existing map camera behavior remains authoritative. Its current reduced-motion bypass continues to prevent animated camera travel when reduced motion is enabled.

### Filter-result reflow

Clinic cards use position-only layout animation when their visible order or position changes after filters update.

- Reflow lasts 180 milliseconds with the calm easing curve.
- Cards do not stagger, scale, or animate from off-screen.
- Newly added results may fade in over 140–160 milliseconds, while removed results may fade out over the same duration if doing so does not delay the next result set.
- The results heading, focus order, links, and screen-reader structure remain stable.
- Motion applies only to the currently rendered result page, not to map markers or pagination controls.

## Reduced Motion and Accessibility

The existing `MotionProvider` and ThriveMap `useReducedMotion` hook remain the single policy source. The policy combines `prefers-reduced-motion` with the in-app Reduce motion setting.

When reduced motion is active:

- Layout and transform animations are disabled.
- Map visibility and card reflow update immediately.
- The selected preview may appear immediately; a minimal opacity change is optional only if the provider permits it without delaying content.
- No information, focus movement, or control availability depends on an animation completing.

Motion is supplementary. Selected state remains communicated by `aria-current`, border treatment, text, and map context. The user can reverse Hide/Show or change selection before an animation completes.

## Component Boundaries

- `MotionProvider`: retains global lazy loading and reduced-motion policy.
- Search motion constants module: exports calm easing and named durations.
- `AppShell`: owns map visibility layout and opacity transitions.
- `SearchResultsPanel` / clinic card wrapper: owns result position reflow.
- `SearchPageClient`: owns presence and crossfade of the contextual map preview.
- `ClinicMap`: retains camera movement behavior and does not receive decorative animation.

No search data, URL parameter, filtering, or map-marker contract changes are required.

## State and Data Flow

1. Existing search or selection state changes.
2. React renders the new semantic state immediately.
3. The owning component animates only the visual difference between the previous and next render.
4. `MotionProvider` removes layout/transform animation when reduced motion is active.
5. URL state, focus state, and ARIA attributes remain synchronized with the new state, not with animation completion.

## Failure and Interruption Behavior

- If Motion fails to initialize, the CSS layout and React state remain fully usable.
- Rapid map toggles or clinic selections interrupt and reverse the current transition instead of queuing animations.
- Empty and error result states render directly and do not wait for card exit animation.
- Map loading and tile errors retain their current behavior; the motion layer does not mask them.

## Testing Strategy

Unit tests will cover:

- Shared motion constants and the calm timing limits.
- Reduced-motion policy producing immediate transition values.
- Map visibility preserving the existing accessible Show map / Hide map states.
- Contextual preview presence following clinic selection without duplicate actionable previews.
- Result cards retaining stable semantics and selection attributes when wrapped for layout motion.

Existing search, map, view-preference, and accessibility tests must remain green. Manual verification will check desktop map toggling, rapid selection changes, filter reflow, mobile list/map behavior, and the in-app Reduce motion preference.

## Acceptance Criteria

- The three scoped interactions feel connected without bounce or decorative movement.
- No animation exceeds 220 milliseconds.
- Reduce motion makes changes effectively immediate.
- Users can interact during transitions.
- Search results, map selection, URL state, focus order, and accessible names remain unchanged.
- No new dependency is added.
- Unit tests, type checking, linting, and the production build pass.
