# http-errors

HTTP error classes for backend APIs, including 4xx client errors and 5xx server errors.

## Installation

```sh
$ npm install @web-ts-toolkit/http-errors
```

## Example

### Basic Usage

```js
const { HttpError, UnauthorizedError, ServiceUnavailableError } = require('@web-ts-toolkit/http-errors');

throw new UnauthorizedError(); // default message: 'The user is not authorized'
throw new UnauthorizedError('you are a bad guy!'); // custom message: 'you are a bad guy!'

throw new HttpError(503); // default message: 'The server is temporarily unable to handle the request'
throw new HttpError(503, 'please try again later'); // custom message: 'please try again later'

throw new ServiceUnavailableError();
```

### Sending Status Codes

```js
const express = require('express');
const mongoose = require('mongoose');
const {
  ClientError,
  UnauthorizedError,
  BadRequestError,
  ServiceUnavailableError,
} = require('@web-ts-toolkit/http-errors');

const router = express.Router();

router.put('/items/:id', updateItem);

function updateItem(req, res) {
  mongoose
    .model('Item')
    .findById(req.params.id)
    .then((item) => {
      if (!item) throw new BadRequestError('item does not exist');
      if (item.ownedBy !== req.user.id) throw new UnauthorizedError('invalid access to this item');

      const data = req.body;
      if (data.ownedBy !== req.user.id) throw new ClientError(403, 'cannot update owners of items');

      item.set(data);
      return item.save();
    })
    .then((item) => res.json(item))
    .catch((err) => {
      if (err.statusCode) {
        return res.status(err.statusCode).send({ message: err.message });
      }

      const fallback = new ServiceUnavailableError('database temporarily unavailable');
      return res.status(fallback.statusCode).send({ message: fallback.message });
    });
}
```

## Error Hierarchy

`HttpError` is the neutral base class.

`ClientError` is the base class for 4xx responses.

`ServerError` is the base class for 5xx responses.

## Client Errors

| Code | Description                     | Class Name                        | Default Message                                                                                            |
| ---- | ------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 400  | Bad Request                     | BadRequestError                   | The server cannot process the request due to a client error                                                |
| 401  | Unauthorized                    | UnauthorizedError                 | The user is not authorized                                                                                 |
| 403  | Forbidden                       | ForbiddenError                    | The server refused to authorize the request                                                                |
| 404  | Not Found                       | NotFoundError                     | The server did not find a current representation for the target resource                                   |
| 405  | Method Not Allowed              | MethodNotAllowedError             | The method received is not allowed                                                                         |
| 406  | Not Acceptable                  | NotAcceptableError                | The request is not acceptable to the user agent                                                            |
| 407  | Proxy Authentication Required   | ProxyAuthRequiredError            | The client needs to authenticate itself in order to use a proxy                                            |
| 408  | Request Timeout                 | RequestTimeoutError               | The request was not completed in the expected time                                                         |
| 409  | Conflict                        | ConflictError                     | The request was not completed due to a conflict with the target resource                                   |
| 410  | Gone                            | GoneError                         | The target resource is no longer available at the origin server                                            |
| 411  | Length Required                 | LengthRequiredError               | The server refuses to accept the request without a defined Content-Length                                  |
| 412  | Precondition Failed             | PreconditionFailedError           | One or more conditions given in the request header fields evaluated to false                               |
| 413  | Payload Too Large               | PayloadTooLargeError              | The request payload is too large                                                                           |
| 414  | URI Too Long                    | UriTooLongError                   | The request target is too long                                                                             |
| 415  | Unsupported Media Type          | UnsupportedMediaTypeError         | The payload is in a format not supported                                                                   |
| 416  | Requested Range Not Satisfiable | RequestedRangeNotSatisfiableError | None of the ranges in the request's Range header field overlap the current extent of the selected resource |
| 417  | Expectation Failed              | ExpectationFailedError            | The expectation given in the request's Expect header field could not be met                                |
| 418  | I'm a teapot                    | TeapotError                       | I'm a teapot                                                                                               |
| 421  | Misdirected Request             | MisdirectedRequestError           | The request was directed at a server that is not able to produce a response                                |
| 422  | Unprocessable Entity            | UnprocessableEntityError          | The server is unable to process the request                                                                |
| 423  | Locked                          | LockedError                       | The source or destination resource of a method is locked                                                   |
| 424  | Failed Dependency               | FailedDependencyError             | The requested action depended on another action                                                            |
| 426  | Upgrade Required                | UpgradeRequiredError              | This service requires use of a different protocol                                                          |
| 428  | Precondition Required           | PreconditionRequiredError         | This request is required to be conditional                                                                 |
| 429  | Too Many Requests               | TooManyRequestsError              | The user has sent too many requests in a given amount of time                                              |
| 431  | Request Header Fields Too Large | RequestHeaderFieldsTooLargeError  | Request header fields too large                                                                            |
| 451  | Unavailable For Legal Reasons   | UnavailableForLegalReasonsError   | Denied access due to a consequence of a legal demand                                                       |

## Server Errors

| Code | Description                     | Class Name                         | Default Message                                                                 |
| ---- | ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| 500  | Internal Server Error           | InternalServerError                | The server encountered an unexpected condition                                  |
| 501  | Not Implemented                 | NotImplementedError                | The server does not support the functionality required to fulfill the request   |
| 502  | Bad Gateway                     | BadGatewayError                    | The server received an invalid response from an upstream server                 |
| 503  | Service Unavailable             | ServiceUnavailableError            | The server is temporarily unable to handle the request                          |
| 504  | Gateway Timeout                 | GatewayTimeoutError                | The server did not receive a timely response from an upstream server            |
| 505  | HTTP Version Not Supported      | HttpVersionNotSupportedError       | The server does not support the HTTP protocol version used in the request       |
| 506  | Variant Also Negotiates         | VariantAlsoNegotiatesError         | The server has an internal configuration error                                  |
| 507  | Insufficient Storage            | InsufficientStorageError           | The server is unable to store the representation needed to complete the request |
| 508  | Loop Detected                   | LoopDetectedError                  | The server detected an infinite loop while processing the request               |
| 510  | Not Extended                    | NotExtendedError                   | Further extensions to the request are required for the server to fulfill it     |
| 511  | Network Authentication Required | NetworkAuthenticationRequiredError | The client needs to authenticate to gain network access                         |
