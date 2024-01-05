import { PassThrough, Readable } from 'stream';

export type JsonPrimitive = null | string | number | boolean;
export type JsonValue = JsonPrimitive | Array<JsonValue> | { [k: string]: JsonValue };

export function createBuilder() {
    return new JsonStreamBuilder(null);
}

abstract class Builder<ParentBuilder extends Builder<any> | null> {
    protected readonly stream = new PassThrough();
    protected readonly queue: Array<Builder<any>> = [];
    protected current: Builder<any> | null = null;
    protected endScheduled = false;

    constructor(protected readonly parent: ParentBuilder) {}

    public asStream(): Readable {
        return this.stream;
    }

    protected addChildBuilder(child: Builder<any>): this {
        this.queue.push(child);

        return this.consumeChildBuilder();
    }

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

export class JsonStreamBuilder<
    ParentBuilder extends Builder<any> | null,
> extends Builder<ParentBuilder> {
    public primitive(data: JsonPrimitive): JsonStreamBuilder<ParentBuilder> {
        return this.value(data);
    }

    public object(data: Record<string, JsonValue>): JsonStreamBuilder<ParentBuilder>;
    public object(): ObjectStreamBuilder<ParentBuilder>;
    public object(
        data?: Record<string, JsonValue>,
    ): JsonStreamBuilder<ParentBuilder> | ObjectStreamBuilder<ParentBuilder> {
        if (data) return this.value(data);

        const builder = new ObjectStreamBuilder(this.parent);
        this.addChildBuilder(builder).scheduleEnd();

        return builder;
    }

    public array(data: Array<JsonValue>): JsonStreamBuilder<ParentBuilder>;
    public array(): ArrayStreamBuilder<ParentBuilder>;
    public array(
        data?: Array<JsonValue>,
    ): JsonStreamBuilder<ParentBuilder> | ArrayStreamBuilder<ParentBuilder> {
        if (data) return this.value(data);

        const builder = new ArrayStreamBuilder<ParentBuilder>(this.parent);
        this.addChildBuilder(builder).scheduleEnd();

        return builder;
    }

    private value(data: JsonValue): JsonStreamBuilder<ParentBuilder> {
        const builder = new ValueStreamBuilder<ParentBuilder>(this.parent).value(data);
        this.addChildBuilder(builder).scheduleEnd();

        return this;
    }
}

export class ObjectStreamBuilder<
    ParentBuilder extends Builder<any> | null,
> extends Builder<ParentBuilder> {
    private firstPropertyInserted: boolean = false;

    constructor(parent: ParentBuilder) {
        super(parent);
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue('{'));
    }

    public addProperty(key: string): JsonStreamBuilder<ObjectStreamBuilder<ParentBuilder>>;
    public addProperty(key: string, value: JsonValue): ObjectStreamBuilder<ParentBuilder>;
    public addProperty(
        key: string,
        value?: JsonValue,
    ): JsonStreamBuilder<ObjectStreamBuilder<ParentBuilder>> | ObjectStreamBuilder<ParentBuilder> {
        if (value !== undefined) return this.pushProperty(key, value);

        const builder = new JsonStreamBuilder<ObjectStreamBuilder<ParentBuilder>>(this);

        this.insertCommaIfNeeded();
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue(`"${key}":`));
        this.addChildBuilder(builder);

        return builder;
    }
    public end(): ParentBuilder {
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue('}'));
        this.scheduleEnd();

        return this.parent;
    }

    private pushProperty(key: string, value: JsonValue): ObjectStreamBuilder<ParentBuilder> {
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

export class ArrayStreamBuilder<
    ParentBuilder extends Builder<any> | null,
> extends Builder<ParentBuilder> {
    private firstItemInserted: boolean = false;

    constructor(parent: ParentBuilder) {
        super(parent);
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue('['));
    }

    public addItem(): JsonStreamBuilder<ArrayStreamBuilder<ParentBuilder>>;
    public addItem(value: JsonValue): ArrayStreamBuilder<ParentBuilder>;
    public addItem(
        value?: JsonValue,
    ): JsonStreamBuilder<ArrayStreamBuilder<ParentBuilder>> | ArrayStreamBuilder<ParentBuilder> {
        if (value !== undefined) return this.pushItem(value);

        const builder = new JsonStreamBuilder<ArrayStreamBuilder<ParentBuilder>>(this);

        this.insertCommaIfNeeded();
        this.addChildBuilder(builder);

        return builder;
    }
    public end(): ParentBuilder {
        this.addChildBuilder(new ValueStreamBuilder(this).rawValue(']'));
        this.scheduleEnd();

        return this.parent;
    }

    private pushItem(value: JsonValue): ArrayStreamBuilder<ParentBuilder> {
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

export class ValueStreamBuilder<
    ParentBuilder extends Builder<any> | null,
> extends Builder<ParentBuilder> {
    public value(data: JsonValue): ValueStreamBuilder<ParentBuilder> {
        return this.rawValue(JSON.stringify(data));
    }

    public rawValue(data: string): ValueStreamBuilder<ParentBuilder> {
        this.stream.push(data);
        this.stream.push(null);

        return this;
    }
}

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
