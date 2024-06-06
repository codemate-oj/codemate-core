import { Err, ForbiddenError, NotFoundError, PermissionError } from 'hydrooj';

export const ProblemListNotFountError = Err('ProblemListNotFountError', NotFoundError, 'Problem list {0} not found.');

export const NotAllowedToVisitPrivateListError = Err(
    'NotAllowedToVisitPrivateListError',
    ForbiddenError,
    'You are not allowed to visit private list {0}.',
);

export const ProblemNotFoundInListError = Err('ProblemNotFoundInListError', NotFoundError, 'Problem {0} not found in list {1}.');

export const ProblemNoNextError = Err('ProblemNoNextError', NotFoundError, 'Problem {0} is the last one in list {1}.');

export const ProblemNoPreviousError = Err('ProblemNoPreviousError', NotFoundError, 'Problem {0} is the first one in list {1}.');

export const ProblemNotActivatedError = Err('ProblemNotActivatedError', PermissionError, 'Problem {0} is not activated.');
