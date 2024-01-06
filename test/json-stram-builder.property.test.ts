import { describe, test, expect } from 'vitest';
import fc from 'fast-check';

import { JsonValue, createBuilder, JsonStreamBuilder, toJson } from '../json-straam-builder';

/** Generates random json structures */
const jsonArbitrary = fc.letrec<{ value: JsonValue }>(tie => ({
    value: fc.oneof(
        { arbitrary: fc.constant(null), weight: 1 },
        { arbitrary: fc.boolean(), weight: 1 },
        { arbitrary: fc.hexaString({ maxLength: 5 }), weight: 2 },
        {
            arbitrary: fc
                .integer()
                .filter(n => n !== -0 && Number.isFinite(n) && Number.isSafeInteger(n)),
            weight: 2,
        },
        { arbitrary: fc.float().filter(n => n !== -0 && Number.isFinite(n)), weight: 2 },
        {
            arbitrary: fc.dictionary(fc.hexaString({ maxLength: 5 }), tie('value'), {
                maxKeys: 10,
            }),
            weight: 3,
        },
        { arbitrary: fc.array(tie('value')), weight: 3 },
    ),
}));

describe('json stream builder properties', () => {
    test('value obtained from the stream should always produce the same value as input', () => {
        return fc.assert(
            fc.asyncProperty(jsonArbitrary.value, fc.gen(), async (value, g) => {
                const builder = createBuilder();

                walkAndRecreateUsingBuilder(value, g, builder);

                const result = await toJson(builder.asStream());

                expect(result).toEqual(value);
            }),
        );
    });

    test('value obtained from the stream should always produce the same value as input regardless of order of calls across child builders', () => {
        return fc.assert(
            fc.asyncProperty(
                jsonArbitrary.value,
                fc.gen(),
                fc.scheduler(),
                async (value, g, scheduler) => {
                    const builder = createBuilder();

                    await walkAndRecreateUsingBuilderAsync(value, g, scheduler, builder);
                    await scheduler.waitAll();

                    const result = await toJson(builder.asStream());

                    expect(result).toEqual(value);
                },
            ),
        );
    });
});

/** Reads given json value property by property, and reconstructs it using the builder. */
function walkAndRecreateUsingBuilder<B extends JsonStreamBuilder<any>>(
    value: JsonValue,
    g: fc.GeneratorValue,
    builder: B,
): B extends JsonStreamBuilder<infer P> ? P : never {
    if (value === null || typeof value !== 'object') return builder.primitive(value);

    if (Array.isArray(value)) {
        return value
            .reduce(
                (acc, value) =>
                    // Either add the value as is, without creating child builders, or construct it manually.
                    g(fc.boolean)
                        ? acc.addItem(value)
                        : walkAndRecreateUsingBuilder(value, g, acc.addItem()),
                builder.array(),
            )
            .end();
    }

    return Object.entries(value)
        .reduce(
            (acc, [key, value]) =>
                // Either add the value as is, without creating child builders, or construct it manually.
                g(fc.boolean)
                    ? acc.addProperty(key, value)
                    : walkAndRecreateUsingBuilder(value, g, acc.addProperty(key)),
            builder.object(),
        )
        .end();
}

/**
 * Reads given json value property by property, and schedules its construction using the provided scheduler.
 * The scheduler decides in what order the calls to `.addItem`, `.addProperty` and `.primitive` across nested builders are executed.
 * This tests for race conditions and buffering.
 */
async function walkAndRecreateUsingBuilderAsync<B extends JsonStreamBuilder<any>>(
    value: JsonValue,
    g: fc.GeneratorValue,
    s: fc.Scheduler,
    builder: B,
): Promise<unknown> {
    if (value === null || typeof value !== 'object') {
        const scheduledTick = s.schedule(tick());

        scheduledTick.then(() => builder.primitive(value));

        return s.waitFor(scheduledTick);
    }

    if (Array.isArray(value)) {
        const arrayBuilder = builder.array();
        const result = value.reduce(
            (accP, item) => {
                return accP.then(({ allItemsAddedP }) => {
                    const scheduledTick = s.schedule(tick());
                    const shouldAddValueDirectly = g(fc.boolean);

                    const itemAddedP = scheduledTick.then(() => {
                        return shouldAddValueDirectly
                            ? arrayBuilder.addItem(item)
                            : walkAndRecreateUsingBuilderAsync(item, g, s, arrayBuilder.addItem());
                    });

                    return s.waitFor(scheduledTick).then(() => ({
                        allItemsAddedP: [...allItemsAddedP, itemAddedP],
                    }));
                });
            },
            Promise.resolve({ allItemsAddedP: [] }) as Promise<{
                allItemsAddedP: Promise<unknown>[];
            }>,
        );

        return result
            .then(({ allItemsAddedP }) => Promise.all(allItemsAddedP.map(p => s.waitFor(p))))
            .then(() => arrayBuilder.end());
    }

    const objectBuilder = builder.object();

    const allPropertiesAddedP = Object.entries(value).map(([key, value]) => {
        const shouldAddValueDirectly = g(fc.boolean);

        return s.schedule(tick()).then(() => {
            return shouldAddValueDirectly
                ? objectBuilder.addProperty(key, value)
                : walkAndRecreateUsingBuilderAsync(value, g, s, objectBuilder.addProperty(key));
        });
    });

    return Promise.all(allPropertiesAddedP.map(p => s.waitFor(p))).then(() => objectBuilder.end());
}

function tick() {
    return Promise.resolve();
}
