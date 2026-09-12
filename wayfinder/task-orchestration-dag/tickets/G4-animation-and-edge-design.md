# G4 — Animation and edge design

**Type**: grilling (+ prototype candidate)
**Status**: open
**Blocked by**: [G15 Current client placement](G15-current-client-placement.md), [R5 G6 renderer adapter stability](R5-g6-renderer-adapter-stability.md)
**Blocks**: [G8 Global progress wavefront](G8-z-enhancement-global-progress-wavefront.md), [G20 First-release scope, compatibility, and evaluation](G20-v1-scope-and-evaluation.md)

## Context retained from G2

The accepted prototype distinguishes dependencies, containment, and execution correlations; makes active work visible; turns completed dependency paths green; highlights upstream and downstream relations on hover; and disables continuous motion under reduced-motion preference. G6 5.1.1 required explicit draw in the tested update path, and continuous dash animation worked through the display-object animation API.

The container and renderer API are not stable inputs. Current DSH has newer right-sidebar and global-panel lifecycles, upstream does not own G6, and the prototype reaches renderer implementation details.

## Question

How should renderer-neutral Task, Attempt, assurance, hold, dependency, containment, execution, and unknown states be presented and animated after client placement and renderer contracts are fixed?

Resolve insertion, execution, verification, completion, rejection, failure, cancellation, interruption, supersession, replan, Attempt Groups, reduced motion, animation cancellation, and whether containment is a group, edge, or view-dependent representation.
