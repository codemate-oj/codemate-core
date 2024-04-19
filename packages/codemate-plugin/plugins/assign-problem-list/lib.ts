import { Err, NotFoundError, PermissionError } from 'hydrooj';

export const ProblemNotFoundInListError = Err('ProblemNotFoundInListError', NotFoundError, 'Problem {0} not found in list {1}.');

export const ProblemNoNextError = Err('ProblemNoNextError', NotFoundError, 'Problem {0} is the last one in list {1}.');

export const ProblemNoPreviousError = Err('ProblemNoPreviousError', NotFoundError, 'Problem {0} is the first one in list {1}.');

export const ProblemNotActivatedError = Err('ProblemNotActivatedError', PermissionError, 'Problem {0} is not activated.');
