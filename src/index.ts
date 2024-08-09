/* eslint-disable import/order */
/* eslint-disable import/no-duplicates */
import { Scope } from './Scope'
import { createG } from './lib/globals'
import { operators } from './operators'
import { Table } from './Table'
import { LuaError } from './LuaError'
import { libMath } from './lib/math'
import { libTable } from './lib/table'
import { libString, metatable as stringMetatable } from './lib/string'
import { getLibOS } from './lib/os'
import { getLibPackage } from './lib/package'
import { LuaType, ensureArray, Config } from './utils'
import { parse as parseScript, parseChunk } from './parser'

// eslint-disable-next-line import/first
import * as utils from './utils'
import * as luaparse from 'luaparse'

interface Script {
    exec: () => LuaType
}

const call = (f: Function | Table, lineNumber?: number, ...args: LuaType[]): LuaType[] => {
    if (f instanceof Function) return ensureArray(f(...args))

    const mm = f instanceof Table && f.getMetaMethod('__call')
    if (mm) return ensureArray(mm(f, ...args))

    throw new LuaError(`attempt to call an uncallable type`, lineNumber)
}

const stringTable = new Table()
stringTable.metatable = stringMetatable

const get = (t: Table | string, v: LuaType, lineNumber?: number): LuaType => {
    if (t instanceof Table) return t.get(v)
    if (typeof t === 'string') return stringTable.get(v)

    throw new LuaError(`no table or metatable found for given type`, lineNumber)
}

const execChunk = (_G: Table, chunk: string, chunkName?: string): LuaType[] => {
    const exec = new Function('__lua', chunk)
    const globalScope = new Scope(_G.strValues).extend()
    if (chunkName) globalScope.setVarargs([chunkName])
    const res = exec({
        globalScope,
        ...operators,
        Table,
        call,
        get
    })
    return res === undefined ? [undefined] : res
}

type Chunk = ReturnType<typeof parseChunk>

function lexSource(source: string): Chunk {
    return parseChunk(source)
}

function createEnv(
    config: Config = {}
): {
    parse: (script: string | Chunk, locations?: boolean) => Script
    parseFile: (path: string) => Script
    loadLib: (name: string, value: Table) => void
} {
    const cfg: Config = {
        LUA_PATH: './?.lua',
        stdin: '',
        stdout: console.log,
        ...config
    }

    const _G = createG(cfg, execChunk)

    const { libPackage, _require } = getLibPackage(
        (content, moduleName) => execChunk(_G, parseScript(content), moduleName)[0],
        cfg
    )
    const loaded = libPackage.get('loaded') as Table

    const loadLib = (name: string, value: Table): void => {
        _G.rawset(name, value)
        loaded.rawset(name, value)
    }

    loadLib('_G', _G)
    loadLib('package', libPackage)
    loadLib('math', libMath)
    loadLib('table', libTable)
    loadLib('string', libString)
    loadLib('os', getLibOS(cfg))

    _G.rawset('require', _require)

    const { setGlobalVars = () => undefined } = config
    setGlobalVars(_G)

    const parse = (code: string, locations?: boolean): Script => {
        const script = parseScript(code, locations)
        return {
            exec: () => execChunk(_G, script)[0]
        }
    }

    const parseFile = (filename: string): Script => {
        if (!cfg.fileExists) throw new LuaError('parseFile requires the config.fileExists function')
        if (!cfg.loadFile) throw new LuaError('parseFile requires the config.loadFile function')

        if (!cfg.fileExists(filename)) throw new LuaError('file not found')

        return parse(cfg.loadFile(filename))
    }

    return {
        parse,
        parseFile,
        loadLib
    }
}
export { createEnv, Table, LuaError, lexSource, utils, luaparse }
