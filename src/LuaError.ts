export class LuaError extends Error {
    public constructor(message: string, public lineNumber?: number) {
        super()
        this.message = message
    }

    public toString(): string {
        return `LuaError: ${this.message}`
    }
}
