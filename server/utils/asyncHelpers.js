// concurrency queue + retry/backoff helper
export async function pMap(list, mapper, { concurrency = 4 } = {}) {
    const results = new Array(list.length);
    let i = 0;
    const workers = Array.from({ length: concurrency }).map(async () => {
        while (true) {
            const idx = i++;
            if (idx >= list.length) return;
            try {
                results[idx] = await mapper(list[idx], idx);
            } catch (e) {
                results[idx] = { error: e };
            }
        }
    });
    await Promise.all(workers);
    return results;
}


export async function retry(fn, { retries = 4, minDelayMs = 300 } = {}) {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err) {
            attempt++;
            if (attempt > retries) throw err;
            const delay = Math.round(minDelayMs * Math.pow(2, attempt - 1));
            await new Promise(r => setTimeout(r, delay));
        }
    }
}