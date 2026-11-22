import { createContext, useContext } from "react";

/** The value of `useTransitionProgress()`. */
export interface TransitionProgress {
	/** Progress of the transition the scene comes in with: 1 when it is not entering. */
	entering: number;
	/** Progress of the transition the scene goes out with: 0 when it is not exiting. */
	exiting: number;
	/** True inside a `<TransitionSeries.Sequence>`. */
	isInTransitionSeries: boolean;
}

const OUTSIDE: TransitionProgress = { entering: 1, exiting: 0, isInTransitionSeries: false };

/** Provided by each `<TransitionSeries.Sequence>`. */
export const TransitionProgressContext = createContext<TransitionProgress>(OUTSIDE);

/**
 * The progress of the transitions of the enclosing `<TransitionSeries.Sequence>`: `entering`
 * goes from 0 to 1 while the scene comes in, `exiting` from 0 to 1 while it goes out. Outside a
 * transition series it returns `{ entering: 1, exiting: 0, isInTransitionSeries: false }`.
 * Pairs with the `none()` presentation to drive custom effects.
 */
export function useTransitionProgress(): TransitionProgress {
	return useContext(TransitionProgressContext);
}
