import { describe, it, expect } from 'vitest';

import { createBuilder, toJson } from '../json-stream-builder';

describe('json stream builder', () => {
    it('creates primitive value directly', () => {
        const builder = createBuilder();

        builder.primitive(42);

        return expect(toJson(builder.asStream())).resolves.toEqual(42);
    });

    it('creates plain object directly', () => {
        const builder = createBuilder().object({ foo: null, bar: 42, baz: { a: 1 } });

        return expect(toJson(builder.asStream())).resolves.toEqual({
            foo: null,
            bar: 42,
            baz: { a: 1 },
        });
    });

    it('creates array directly', () => {
        const builder = createBuilder().array([42, null, { a: 1 }]);

        return expect(toJson(builder.asStream())).resolves.toEqual([42, null, { a: 1 }]);
    });

    it('creates object using builder', () => {
        const builder = createBuilder();

        builder
            .object()
            .addProperty('foo', null)
            .addProperty('bar', 42)
            .addProperty('baz', { a: 1 })
            .end();

        return expect(toJson(builder.asStream())).resolves.toEqual({
            foo: null,
            bar: 42,
            baz: { a: 1 },
        });
    });

    it('creates object using builder adding multiple properties at a time', () => {
        const builder = createBuilder();

        builder
            .object()
            .addProperty('foo', null)
            .addProperty('bar', 42)
            .addProperties({})
            .addProperties({
                x: 'a',
                y: 'b',
            })
            .addProperty('baz', { a: 1 })
            .end();

        return expect(toJson(builder.asStream())).resolves.toEqual({
            foo: null,
            bar: 42,
            x: 'a',
            y: 'b',
            baz: { a: 1 },
        });
    });

    it('creates array using builder', () => {
        const builder = createBuilder();

        builder.array().addItem(42).addItem(null).addItem({ a: 1 }).end();

        return expect(toJson(builder.asStream())).resolves.toEqual([42, null, { a: 1 }]);
    });

    it('creates array using builder adding multiple items at a time', () => {
        const builder = createBuilder();

        builder
            .array()
            .addItem(42)
            .addItem(null)
            .addItems([])
            .addItems(['x', 'y'])
            .addItem({ a: 1 })
            .end();

        return expect(toJson(builder.asStream())).resolves.toEqual([42, null, 'x', 'y', { a: 1 }]);
    });

    describe('synchronous', () => {
        it('creates object using builder with nested array', () => {
            const builder = createBuilder();

            builder
                .object()
                .addProperty('foo', null)
                .addProperty('bar', 42)
                .addProperty('sub')
                .array()
                .addItem(1)
                .addItem(2)
                .addItem(3)
                .end()
                .addProperty('baz', { a: 1 })
                .end();

            return expect(toJson(builder.asStream())).resolves.toEqual({
                foo: null,
                bar: 42,
                baz: { a: 1 },
                sub: [1, 2, 3],
            });
        });

        it('creates array using builder with nested object and array', () => {
            const builder = createBuilder();

            builder
                .array()
                .addItem('yes')
                .addItem()
                .object()
                .addProperty('foo', null)
                .addProperty('bar', 42)
                .addProperty('sub')
                .array()
                .addItem(1)
                .addItem(2)
                .addItem(3)
                .end()
                .addProperty('baz', { a: 1 })
                .end()
                .addItem('no')
                .end();

            return expect(toJson(builder.asStream())).resolves.toEqual([
                'yes',
                { foo: null, bar: 42, baz: { a: 1 }, sub: [1, 2, 3] },
                'no',
            ]);
        });
    });

    describe('unordered', () => {
        it('creates object using builder with nested array', () => {
            const builder = createBuilder();

            const objBuilder = builder.object();

            objBuilder.addProperty('foo', null);

            const nestedArrayBuilder = objBuilder.addProperty('sub').array();

            nestedArrayBuilder.addItem(1);
            // while still building the array, add another property to object
            objBuilder.addProperty('bar', 42);
            nestedArrayBuilder.addItem(2);
            nestedArrayBuilder.addItem(3);
            nestedArrayBuilder.end();

            objBuilder.addProperty('baz', { a: 1 });
            objBuilder.end();

            return expect(toJson(builder.asStream())).resolves.toEqual({
                foo: null,
                bar: 42,
                baz: { a: 1 },
                sub: [1, 2, 3],
            });
        });

        it('creates array using builder with nested object and array', () => {
            const builder = createBuilder();

            const rootArrayBuilder = builder.array();

            rootArrayBuilder.addItem('yes');

            const objBuilder = rootArrayBuilder.addItem().object();

            objBuilder.addProperty('foo', null);

            const nestedArrayBuilder = objBuilder.addProperty('sub').array();

            nestedArrayBuilder.addItem(1);
            // while still building the array, add another property to object
            objBuilder.addProperty('bar', 42);
            nestedArrayBuilder.addItem(2);
            // while still building the array, add another property to root array
            rootArrayBuilder.addItem('no');
            nestedArrayBuilder.addItem(3);
            nestedArrayBuilder.end();

            objBuilder.addProperty('baz', { a: 1 });
            objBuilder.end();
            rootArrayBuilder.end();

            return expect(toJson(builder.asStream())).resolves.toEqual([
                'yes',
                { foo: null, bar: 42, baz: { a: 1 }, sub: [1, 2, 3] },
                'no',
            ]);
        });
    });

    describe('async', () => {
        it('creates object using builder with nested array', async () => {
            const builder = createBuilder();
            const objBuilder = builder.object();

            objBuilder.addProperty('foo', null);
            await wait(10);

            const nestedArrayBuilder = objBuilder.addProperty('sub').array();
            await wait(10);
            nestedArrayBuilder.addItem(1);
            await wait(10);
            // while still building the array, add another property to object
            objBuilder.addProperty('bar', 42);
            await wait(10);
            nestedArrayBuilder.addItem(2);
            await wait(10);
            nestedArrayBuilder.addItem(3);
            await wait(10);
            nestedArrayBuilder.end();
            await wait(10);
            objBuilder.addProperty('baz', { a: 1 });
            await wait(10);
            objBuilder.end();

            return expect(toJson(builder.asStream())).resolves.toEqual({
                foo: null,
                bar: 42,
                baz: { a: 1 },
                sub: [1, 2, 3],
            });
        });

        it('creates array using builder with nested object and array', async () => {
            const builder = createBuilder();

            const rootArrayBuilder = builder.array();
            await wait(10);
            rootArrayBuilder.addItem('yes');
            await wait(10);

            const objBuilder = rootArrayBuilder.addItem().object();

            await wait(10);
            objBuilder.addProperty('foo', null);
            await wait(10);

            const nestedArrayBuilder = objBuilder.addProperty('sub').array();
            await wait(10);
            nestedArrayBuilder.addItem(1);
            await wait(10);
            // while still building the array, add another property to object
            objBuilder.addProperty('bar', 42);
            await wait(10);
            nestedArrayBuilder.addItem(2);
            await wait(10);
            // while still building the array, add another property to root array
            rootArrayBuilder.addItem('no');
            await wait(10);
            nestedArrayBuilder.addItem(3);
            await wait(10);
            nestedArrayBuilder.end();
            await wait(10);

            objBuilder.addProperty('baz', { a: 1 });
            await wait(10);
            objBuilder.end();
            await wait(10);
            rootArrayBuilder.end();

            return expect(toJson(builder.asStream())).resolves.toEqual([
                'yes',
                { foo: null, bar: 42, baz: { a: 1 }, sub: [1, 2, 3] },
                'no',
            ]);
        });
    });

    describe('invalid uses', () => {
        it('should ignore cases when trying to write primitive value after emission ended', () => {
            const builder = createBuilder();

            builder.primitive(42);
            builder.primitive(42);

            return expect(toJson(builder.asStream())).resolves.toEqual(42);
        });

        it('should ignore cases when trying to write non-primitive value after emission ended', () => {
            const builder = createBuilder();

            builder.array().addItem(1).addItem(2).addItem(3).end();
            builder.array().addItem(1).addItem(2).addItem(3).end();

            return expect(toJson(builder.asStream())).resolves.toEqual([1, 2, 3]);
        });

        it('should ignore items written after ending the array', () => {
            const builder = createBuilder();

            const arrayBuilder = builder.array();

            arrayBuilder.addItem(1);
            arrayBuilder.addItem(2);
            arrayBuilder.addItem(3);
            arrayBuilder.end();
            arrayBuilder.addItem(4);

            return expect(toJson(builder.asStream())).resolves.toEqual([1, 2, 3]);
        });

        it('should ignore properties written after ending the object', () => {
            const builder = createBuilder();

            const arrayBuilder = builder.object();

            arrayBuilder.addProperty('a', 1);
            arrayBuilder.addProperty('b', 2);
            arrayBuilder.addProperty('c', 3);
            arrayBuilder.end();
            arrayBuilder.addProperty('d', 4);

            return expect(toJson(builder.asStream())).resolves.toEqual({ a: 1, b: 2, c: 3 });
        });
    });
});

function wait(nMs: number) {
    return new Promise(res => setTimeout(res, nMs));
}
