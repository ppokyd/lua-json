const { isNull, isBoolean, isNumber, isString, isArray, isObject, isEmpty, fromPairs, keys, map, repeat, property } = require('lodash')
const { parse: parseLua } = require('luaparse')

const formatLuaString = (string, singleQuote) => (singleQuote ? `'${string.replace(/'/g, "\\'")}'` : `"${string.replace(/"/g, '\\"')}"`)

const formatLuaKey = (string, singleQuote) => (string.match(/^[a-zA-Z_][a-zA-Z_0-9]*$/) ? string : `[${formatLuaString(string, singleQuote)}]`)

const format = (value, options = { eol: '\n', singleQuote: true, spaces: 2 }) => {
  options = options || {}
  const eol = (options.eol = isString(options.eol) ? options.eol : '\n')
  options.singleQuote = isBoolean(options.singleQuote) ? options.singleQuote : true
  options.spaces = isNull(options.spaces) || isNumber(options.spaces) || isString(options.spaces) ? options.spaces : 2

  const rec = (value, i = 0) => {
    if (isNull(value)) {
      return 'nil'
    }
    if (isBoolean(value) || isNumber(value)) {
      return value.toString()
    }
    if (isString(value)) {
      return formatLuaString(value, options.singleQuote)
    }
    if (isArray(value)) {
      if (isEmpty(value)) {
        return '{}'
      }
      if (options.spaces) {
        const spaces = isNumber(options.spaces) ? repeat(' ', options.spaces * (i + 1)) : repeat(options.spaces, i + 1)
        const spacesEnd = isNumber(options.spaces) ? repeat(' ', options.spaces * i) : repeat(options.spaces, i)
        return `{${eol}${value.map(e => `${spaces}${rec(e, i + 1)},`).join(eol)}${eol}${spacesEnd}}`
      }
      return `{${value.map(e => {
        return `${rec(e, i + 1)},`
      }).join('')}}`
    }
    if (isObject(value)) {
      if (isEmpty(value)) {
        return '{}'
      }
      if (options.spaces) {
        const spaces = isNumber(options.spaces) ? repeat(' ', options.spaces * (i + 1)) : repeat(options.spaces, i + 1)
        const spacesEnd = isNumber(options.spaces) ? repeat(' ', options.spaces * i) : repeat(options.spaces, i)

        const res = `${eol}${keys(value)
          .map(key => `${spaces}${formatLuaKey(key, options.singleQuote)} = ${rec(value[key], i + 1)},`)
          .join(eol)}${eol}${spacesEnd}`;

        return value.type === 'property'
          ? `[${isString(value.key) ? `'${value.key}'` : value.key }] = ${rec(value.value, i + 1)}`
          : `{${res}}`;
      }
      return `{${keys(value)
        .map(key => `${formatLuaKey(key, options.singleQuote)}=${rec(value[key], i + 1)},`)
        .join('')}}`
    }
    throw new Error(`can't format ${typeof value}`)
  }

  return `return${options.spaces ? ' ' : ''}${rec(value)}`
}

const luaAstToJson = ast => {
  // literals
  if (['NilLiteral', 'BooleanLiteral', 'NumericLiteral', 'StringLiteral'].includes(ast.type)) {
    return ast.value
  }
  // basic expressions
  if (ast.type === 'UnaryExpression' && ast.operator === '-') {
    return -luaAstToJson(ast.argument)
  }
  if (ast.type === 'Identifier') {
    return ast.name
  }
  // tables
  if (['TableKey', 'TableKeyString'].includes(ast.type)) {
    return { __internal_table_key: true, key: luaAstToJson(ast.key), value: luaAstToJson(ast.value) }
  }
  if (ast.type === 'TableValue') {
    return luaAstToJson(ast.value)
  }
  if (ast.type === 'TableConstructorExpression') {
    if (ast.fields[0] && ast.fields[0].key) {
      const object = fromPairs(
        map(ast.fields, field => {
          const { key, value } = luaAstToJson(field);
          return [key, escape(value)]
        }),
      )
      return isEmpty(object) ? [] : object
    }
    return ast.fields
      .filter(field => luaAstToJson(field) !== null)
      .map(field => {
        const value = luaAstToJson(field);
        return value.__internal_table_key ? { type: 'property', key: value.key, value: escape(value.value) } : escape(value)
      });
  }
  // top-level statements, only looking at the first statement, either return or local
  // todo: filter until return or local?
  if (ast.type === 'LocalStatement') {
    const values = ast.init.map(luaAstToJson)
    return values.length === 1 ? values[0] : values
  }
  if (ast.type === 'ReturnStatement') {
    const values = ast.arguments.map(luaAstToJson)
    return values.length === 1 ? values[0] : values
  }
  if (ast.type === 'Chunk') {
    return luaAstToJson(ast.body[0])
  }
  throw new Error(`can't parse ${ast.type}`)
}

const parse = value => luaAstToJson(parseLua(value, { comments: false }))

const escape = value => value && value.replace
  ? value
    .replace(/\\\\/gm, '\\\\\\\\')
    .replace(/\\r/gm, '\\\\r')
    .replace(/\\n/gm, '\\\\n')
    .replace(/\n/gm, '\\n')
  : value;

module.exports = {
  format,
  parse,
}
