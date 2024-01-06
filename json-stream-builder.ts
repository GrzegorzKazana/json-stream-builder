import { PassThrough, Readable } from 'stream';

export type JsonPrimitive = null | string | number | boolean;
export type JsonValue = JsonPrimitive | Array<JsonValue> | { [k: string]: JsonValue };
export type JsonBuilder =
    | JsonStreamBuilder<any>
    | ArrayStreamBuilder<any>
    | ObjectStreamBuilder<any>
    | ValueStreamBuilder<any>;

/**
 * Creates instance of a builder. Can be used to start emiting json chunks of primitives/arrays/objects.
 */
export function createBuilder() {
    return new JsonStreamBuilder(null);
}

/** Base class, manages the stream queueing and scheduling */
abstract class Builder<Parent extends Builder<any> | null> {
    /** Output stream, to which we write json contents in accordance to queue mechanism */
    protected readonly stream = new PassThrough();
    /** List of Builders that need to be processed in order. */
    protected readonly queue: Array<Builder<any>> = [];
    /** Currently processed stream (represented via Builder) */
    protected current: Builder<any> | null = null;
    /** Once the queue is drained, and the value set to true, the stream exposed to the user will emit `end` event */
    protected endScheduled = false;

    constructor(protected readonly parent: Parent) {}

    public asStream(): Readable {
        return this.stream;
    }

    protected addChildBuilder(child: Builder<any>): this {
        if (this.endScheduled) return this;

        this.queue.push(child);

        return this.consumeChildBuilder();
    }

    /** Sequentially subscribes scheduled streams. Think of `concat` function in rxjs. */
    private consumeChildBuilder(): this {
        if (this.current) return this;

        this.current = this.queue.shift() || null;

        if (!this.current && this.endScheduled) {
            this.stream.end();
            return this;
        }

        if (!this.current) {
            return this;
        }

        this.current.asStream().pipe(this.stream, { end: false });
        this.current.asStream().on('end', () => {
            this.current = null;
            this.consumeChildBuilder();
        });

        return this;
    }

    protected scheduleEnd(): this {
        this.endScheduled = true;
        this.consumeChildBuilder();

        return this;
    }
}

/** Default builder, wrapper around all builders for all types */
export class JsonStreamBuilder<Parent extends Builder<any> | null> extends Builder<Parent> {
    /** Pushes primitive value to stream immediately */
    public primitive(data: JsonPrimitive): Parent {
        return this.value(data).end();
    }

    /** Pushes data to stream immediately */
    public object(data: Record<string, JsonValue>): this;
    /**
     * Creates a child builder for objects, which properties can be added any time.
     * Until the child object is finished (via `.end()` call), all other calls are queued.
     */
    public object(): ObjectStreamBuilder<Parent>;
    public object(data?: Record<string, JsonValue>): this | ObjectStreamBuilder<Parent> {
        if (data) return this.value(data);

        const builder = new ObjectStreamBuilder(this.parent);
        this.addChildBuilder(builder).scheduleEnd();

        return builder;
    }

    /** Pushes data to stream immediately */
    public array(data: Array<JsonValue>): this;
    /**
     * Creates a child builder for array, which items can be added any time.
     * Until the child array is finished (via `.end()` call), all other calls are queued.
     */
    public array(): ArrayStreamBuilder<Parent>;
    public array(data?: Array<JsonValue>): this | ArrayStreamBuilder<Parent> {
        if (data) return this.value(data);

        const builder = new ArrayStreamBuilder<Parent>(this.parent);
        this.addChildBuilder(builder).scheduleEnd();

        return builder;
    }

    public end(): Parent {
        this.scheduleEnd();

        return this.parent;
    }

    private value(data: JsonValue): this {
        const builder = new ValueStreamBuilder<Parent>(this.parent).value(data);
        this.addChildBuilder(builder).scheduleEnd();

        return this;
    }
}

/**
 * Builder for all json objects.
 * Properties of objects can be added asynchronously.
 * Building the object should be finalized via `.end()` call.
 */
export class ObjectStreamBuilder<Parent extends Builder<any> | null> extends Builder<Parent> {
    private firstPropertyInserted: boolean = false;

    constructor(parent: Parent) {
        super(parent);
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue('{'));
    }

    /**
     * Creates a child builder which result will be stored under specified `key`.
     * Subsequent calls to `addProperty` are queued, and data is writted in order.
     */
    public addProperty(key: string): JsonStreamBuilder<this>;
    /** Adds value under specified `key` immediately */
    public addProperty(key: string, value: JsonValue): this;
    public addProperty(key: string, value?: JsonValue): JsonStreamBuilder<this> | this {
        if (value !== undefined) return this.pushProperty(key, value);

        const builder = new JsonStreamBuilder<this>(this);

        this.insertCommaIfNeeded();
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue(`"${key}":`));
        this.addChildBuilder(builder);

        return builder;
    }

    /** Finalizes the creation of json object. Waits for all subproperties to be resolved. */
    public end(): Parent {
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue('}'));
        this.scheduleEnd();

        return this.parent;
    }

    private pushProperty(key: string, value: JsonValue): this {
        this.insertCommaIfNeeded();
        this.addChildBuilder(
            new ValueStreamBuilder(this).rawValue(`"${key}":${JSON.stringify(value)}`),
        );

        return this;
    }

    private insertCommaIfNeeded() {
        if (!this.firstPropertyInserted) {
            this.firstPropertyInserted = true;
            return;
        }

        this.addChildBuilder(new ValueStreamBuilder(this).rawValue(`,`));
    }
}

export class ArrayStreamBuilder<Parent extends Builder<any> | null> extends Builder<Parent> {
    private firstItemInserted: boolean = false;

    constructor(parent: Parent) {
        super(parent);
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue('['));
    }

    /**
     * Creates a child builder which is responsible for creating the array item.
     * Subsequent calls to `addItem` are queued, and data is writted in order.
     */
    public addItem(): JsonStreamBuilder<this>;
    /** Adds array item immediately */
    public addItem(value: JsonValue): this;
    public addItem(value?: JsonValue): JsonStreamBuilder<this> | this {
        if (value !== undefined) return this.pushItem(value);

        const builder = new JsonStreamBuilder<this>(this);

        this.insertCommaIfNeeded();
        this.addChildBuilder(builder);

        return builder;
    }

    /** Finalizes the creation of the array. Waits for all items created via child builders to be resolved. */
    public end(): Parent {
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue(']'));
        this.scheduleEnd();

        return this.parent;
    }

    private pushItem(value: JsonValue): this {
        this.insertCommaIfNeeded();
        this.addChildBuilder(new ValueStreamBuilder(this).value(value));

        return this;
    }

    private insertCommaIfNeeded() {
        if (!this.firstItemInserted) {
            this.firstItemInserted = true;
            return;
        }

        this.addChildBuilder(new ValueStreamBuilder(this).rawValue(`,`));
    }
}

/** Dummy builder for writing primitives. Does not create any child builders. */
export class ValueStreamBuilder<Parent extends Builder<any> | null> extends Builder<Parent> {
    public value(data: JsonValue): this {
        return this.rawValue(JSON.stringify(data));
    }

    public rawValue(data: string): this {
        this.stream.push(data);
        this.stream.push(null);

        return this;
    }
}

/** Utility (mostly for testing) collecting values of the stream and parsing them. */
export function toJson(stream: Readable): Promise<JsonValue> {
    return new Promise((resolve, reject) => {
        const chunks: string[] = [];

        stream.on('data', chunk => {
            chunks.push(chunk);
        });

        stream.on('error', reject);

        stream.on('end', () => {
            const stringData = chunks.join('');

            try {
                const data = JSON.parse(stringData);

                resolve(data);
            } catch (err) {
                reject(err);
            }
        });
    });
}
