import { Token, LexerToken, JSONValue } from './typings';
import { isAlpha, isNum, isAlphaNum, trimLeft } from './utils';

export const basicTokens = {
  '(': Token.TOK_LPAREN,
  ')': Token.TOK_RPAREN,
  '*': Token.TOK_STAR,
  ',': Token.TOK_COMMA,
  '.': Token.TOK_DOT,
  ':': Token.TOK_COLON,
  '@': Token.TOK_CURRENT,
  ']': Token.TOK_RBRACKET,
  '{': Token.TOK_LBRACE,
  '}': Token.TOK_RBRACE,
};

const operatorStartToken = {
  '!': true,
  '<': true,
  '=': true,
  '>': true,
};

const skipChars = {
  '\t': true,
  '\n': true,
  '\r': true,
  ' ': true,
};

class StreamLexer {
  _current = 0;
  tokenize(stream: string): LexerToken[] {
    const tokens: LexerToken[] = [];
    this._current = 0;

    let start;
    let identifier;
    let token;
    while (this._current < stream.length) {
      if (isAlpha(stream[this._current])) {
        start = this._current;
        identifier = this.consumeUnquotedIdentifier(stream);
        tokens.push({
          start,
          type: Token.TOK_UNQUOTEDIDENTIFIER,
          value: identifier,
        });
      } else if (basicTokens[stream[this._current]] !== undefined) {
        tokens.push({
          start: this._current,
          type: basicTokens[stream[this._current]],
          value: stream[this._current],
        });
        this._current += 1;
      } else if (isNum(stream[this._current])) {
        token = this.consumeNumber(stream);
        tokens.push(token);
      } else if (stream[this._current] === '[') {
        token = this.consumeLBracket(stream);
        tokens.push(token);
      } else if (stream[this._current] === '"') {
        start = this._current;
        identifier = this.consumeQuotedIdentifier(stream);
        tokens.push({
          start,
          type: Token.TOK_QUOTEDIDENTIFIER,
          value: identifier,
        });
      } else if (stream[this._current] === `'`) {
        start = this._current;
        identifier = this.consumeRawStringLiteral(stream);
        tokens.push({
          start,
          type: Token.TOK_LITERAL,
          value: identifier,
        });
      } else if (stream[this._current] === '`') {
        start = this._current;
        const literal = this.consumeLiteral(stream);
        tokens.push({
          start,
          type: Token.TOK_LITERAL,
          value: literal,
        });
      } else if (operatorStartToken[stream[this._current]] !== undefined) {
        token = this.consumeOperator(stream);
        token && tokens.push(token);
      } else if (skipChars[stream[this._current]] !== undefined) {
        this._current += 1;
      } else if (stream[this._current] === '&') {
        start = this._current;
        this._current += 1;
        if (stream[this._current] === '&') {
          this._current += 1;
          tokens.push({ start, type: Token.TOK_AND, value: '&&' });
        } else {
          tokens.push({ start, type: Token.TOK_EXPREF, value: '&' });
        }
      } else if (stream[this._current] === '|') {
        start = this._current;
        this._current += 1;
        if (stream[this._current] === '|') {
          this._current += 1;
          tokens.push({ start, type: Token.TOK_OR, value: '||' });
        } else {
          tokens.push({ start, type: Token.TOK_PIPE, value: '|' });
        }
      } else {
        const error = new Error(`Unknown character: ${stream[this._current]}`);
        error.name = 'LexerError';
        throw error;
      }
    }
    return tokens;
  }

  private consumeUnquotedIdentifier(stream: string): string {
    const start = this._current;
    this._current += 1;
    while (this._current < stream.length && isAlphaNum(stream[this._current])) {
      this._current += 1;
    }
    return stream.slice(start, this._current);
  }

  private consumeQuotedIdentifier(stream: string): string {
    const start = this._current;
    this._current += 1;
    const maxLength = stream.length;
    while (stream[this._current] !== '"' && this._current < maxLength) {
      let current = this._current;
      if (stream[current] === '\\' && (stream[current + 1] === '\\' || stream[current + 1] === '"')) {
        current += 2;
      } else {
        current += 1;
      }
      this._current = current;
    }
    this._current += 1;
    return JSON.parse(stream.slice(start, this._current));
  }

  private consumeRawStringLiteral(stream: string): string {
    const start = this._current;
    this._current += 1;
    const maxLength = stream.length;
    while (stream[this._current] !== `'` && this._current < maxLength) {
      let current = this._current;
      if (stream[current] === '\\' && (stream[current + 1] === '\\' || stream[current + 1] === `'`)) {
        current += 2;
      } else {
        current += 1;
      }
      this._current = current;
    }
    this._current += 1;
    const literal = stream.slice(start + 1, this._current - 1);
    return literal.replace(`\\'`, `'`);
  }

  private consumeNumber(stream: string): LexerToken {
    const start = this._current;
    this._current += 1;
    const maxLength = stream.length;
    while (isNum(stream[this._current]) && this._current < maxLength) {
      this._current += 1;
    }
    const value = parseInt(stream.slice(start, this._current), 10);
    return { start, value, type: Token.TOK_NUMBER };
  }

  private consumeLBracket(stream: string): LexerToken {
    const start = this._current;
    this._current += 1;
    if (stream[this._current] === '?') {
      this._current += 1;
      return { start, type: Token.TOK_FILTER, value: '[?' };
    }
    if (stream[this._current] === ']') {
      this._current += 1;
      return { start, type: Token.TOK_FLATTEN, value: '[]' };
    }
    return { start, type: Token.TOK_LBRACKET, value: '[' };
  }

  private consumeOperator(stream: string): LexerToken | void {
    const start = this._current;
    const startingChar = stream[start];
    this._current += 1;
    if (startingChar === '!') {
      if (stream[this._current] === '=') {
        this._current += 1;
        return { start, type: Token.TOK_NE, value: '!=' };
      }
      return { start, type: Token.TOK_NOT, value: '!' };
    }
    if (startingChar === '<') {
      if (stream[this._current] === '=') {
        this._current += 1;
        return { start, type: Token.TOK_LTE, value: '<=' };
      }
      return { start, type: Token.TOK_LT, value: '<' };
    }
    if (startingChar === '>') {
      if (stream[this._current] === '=') {
        this._current += 1;
        return { start, type: Token.TOK_GTE, value: '>=' };
      }
      return { start, type: Token.TOK_GT, value: '>' };
    }
    if (startingChar === '=' && stream[this._current] === '=') {
      this._current += 1;
      return { start, type: Token.TOK_EQ, value: '==' };
    }
  }

  private consumeLiteral(stream: string): JSONValue {
    this._current += 1;
    const start = this._current;
    const maxLength = stream.length;

    while (stream[this._current] !== '`' && this._current < maxLength) {
      let current = this._current;
      if (stream[current] === '\\' && (stream[current + 1] === '\\' || stream[current + 1] === '`')) {
        current += 2;
      } else {
        current += 1;
      }
      this._current = current;
    }
    let literalString = trimLeft(stream.slice(start, this._current));
    literalString = literalString.replace('\\`', '`');
    const literal = this.looksLikeJSON(literalString) ? JSON.parse(literalString) : JSON.parse(`"${literalString}"`);
    this._current += 1;
    return literal;
  }

  private looksLikeJSON(literalString: string): boolean {
    const startingChars = '[{"';
    const jsonLiterals = ['true', 'false', 'null'];
    const numberLooking = '-0123456789';

    if (literalString === '') {
      return false;
    }
    if (startingChars.includes(literalString[0])) {
      return true;
    }
    if (jsonLiterals.includes(literalString)) {
      return true;
    }
    if (numberLooking.includes(literalString[0])) {
      try {
        JSON.parse(literalString);
        return true;
      } catch (ex) {
        return false;
      }
    }
    return false;
  }
}

export const Lexer = new StreamLexer();
export default Lexer;
