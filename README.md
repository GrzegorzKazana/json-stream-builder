# json-stream-builder

Stream json generated on the fly!

## What is this library for?

Did you ever want to generate a readable node.js stream (and perhaps pipe it via http) containing dynamically and/or
asynchronously build json structure? Even better, without having to deal with opening/closing brackets, inserting commas
and queueing? If yes, this library is for you!

## Examples

### Trivial

```ts
import { createBuilder } from 'json-stream-builder';

const builder = createBuilder();

builder
    .object()
    .addProperty('foo', null)
    .addProperty('bar', 42)
    .addProperty('baz', { a: 1 })
    .addProperty('yes', 'no')
    .end();

// instance of Readable
const stream = builder.asStream();
// will emit:
// {
// "foo":null
// ,
// "bar":42
// ,
// "baz":{"a":1}
// ,
// "yes":"no"
// }
```

### With nested builders

```ts
import { createBuilder } from 'json-stream-builder';

const builder = createBuilder();

builder
    .object()
    .addProperty('foo', null)
    .addProperty('bar', 42)
    // calling .addProperty/.addItem without value creates child instance of builder
    .addProperty('sub')
    .array()
    .addItem(1)
    .addItem(2)
    .addItem(3)
    // finish child stream creation, go back to previous context
    .end()
    .addProperty('baz', { a: 1 })
    .end();

// instance of Readable
const stream = builder.asStream();
// will emit:
// {
// "foo":null
// ,
// "bar":42
// ,
// "sub":
// [
// 1
// ,
// 2
// ,
// 3
// ]
// ,
// "baz":{"a":1}
// }
```

### Interleaved calls to root and child builders

```ts
import { createBuilder } from 'json-stream-builder';

const builder = createBuilder();
const objectBuilder = builder.object();

objectBuilder.addProperty('foo', null);
objectBuilder.addProperty('bar', 42);

// calling .addProperty/.addItem without value creates child instance of builder
const arrayBuilder = objectBuilder.addProperty('sub').array();

arrayBuilder.addItem(1);
arrayBuilder.addItem(2);
// note: even though we added property while still creating the array
// it is not messing up json array, `"baz":{"a":1}` is queued until array is finished
objectBuilder.addProperty('baz', { a: 1 });

arrayBuilder.addItem(3);
// finish child stream creation
arrayBuilder.end();
// finish root stream creation
objectBuilder.end();

// instance of Readable
const stream = builder.asStream();
// will emit:
// {
// "foo":null
// ,
// "bar":42
// ,
// "sub":
// [
// 1
// ,
// 2
// ,
// 3
// ]
// ,
// "baz":{"a":1}
// }
```

### Real life example - streaming response of paginated upstream api

```ts
import { pipeline } from 'stream';
import { createBuilder } from 'json-stream-builder';

app.get('/', (req, res) => {
    const builder = createBuilder().object();

    builder
        // add some root level properties just for kicks
        .addProperty('date', new Date())
        .addProperty('message', 'hello')
        .addProperty('error', null);

    const arrayBuilder = builder.appProperty('data').array();

    fetchAllPagesFromUpstreamApi(arrayBuilder)
        .then(page => arrayBuilder.end())
        .catch(/** do something */);

    const childBuilder = pipeline(builder.asStream(), res);
});

function fetchAllPagesFromUpstreamApi(arrayBuilder, pageIndex = 0) {
    return fetchPage(pageIndex).then(page => {
        arrayBuilder.addItem(arrayBuilder);

        return page.nextPageIndex
            ? fetchPagesFromUpstreamApi(page.nextPageIndex)
            : Promise.resolve();
    });
}

// will stream over http:
// {
// "date":"some iso timestamp"
// ,
// "message":'hello'
// ,
// "error":null
// ,
// "data":
// [
// {/** page 0 */}
// ,
// {/** page 1 */}
// ,
// {/** page 2 */}
// /** ... */
// ]
// }
```
