// 针对异步任务，如同一时间段调用多次，实际仅运行一次，所有调用都返回此次运行结果

interface IWait {
    resolve: (value?: unknown) => void;
    reject: (reason?: any) => void;
}

export class Once {
    private running: Map<string, Array<IWait>>;

    constructor() {
        this.running = new Map<string, Array<IWait>>();
    }

    public async run<T = any>(key: string, fn: () => Promise<T>): Promise<T> {
        // 已经存在正在运行的方法
        let callbacks = this.running.get(key);
        if (callbacks) {
            return await new Promise((resolve, reject) => {
                callbacks.push({ resolve, reject });
            });
        }

        // 第一次
        callbacks = [];
        this.running.set(key, callbacks);

        // 真正开始执行异步任务
        try {
            const res = await fn();
            for (const cb of callbacks) cb.resolve(res);
            this.running.delete(key);
            return res;
        } catch (e) {
            for (const cb of callbacks) cb.reject(e);
            this.running.delete(key);
            throw e;
        }
    }
}

export const once = new Once();
