'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var Parser = _interopDefault(require('stylus/lib/parser.js'));

function repeatString(str, num) {
  return num > 0 ? str.repeat(num) : '';
}

function nodesToJSON(nodes) {
  return nodes.map(function (node) {
    return node.toJSON();
  });
}

function trimFirst(str) {
  return str.replace(/(^\s*)/g, '');
}

function tirmFirstLength(str) {
  return str.length - trimFirst(str).length;
}

function trimLinefeed(str) {
  return str.replace(/^\n*/, '');
}

function trimFirstLinefeedLength(str) {
  return tirmFirstLength(trimLinefeed(str));
}

function replaceFirstATSymbol(str) {
  var temp = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '$';

  return str.replace(/^\$|/, temp);
}

var isIfExpression = false;
var oldLineno = 1;
var oldColumn = 1;
var returnSymbol = '';

var TYPE_VISITOR_MAP = {
  If: visitIf,
  RGBA: visitRGBA,
  Unit: visitUnit,
  Call: visitCall,
  BinOp: visitBinOp,
  Ident: visitIdent,
  Group: visitGroup,
  Import: visitImport,
  Literal: visitLiteral,
  Params: visitArguments,
  Property: visitProperty,
  'Boolean': visitBoolean,
  'Function': visitFunction,
  Selector: visitSelector,
  Arguments: visitArguments,
  Expression: visitExpression
};

function handleLineno(lineno) {
  return repeatString('\n', lineno - oldLineno);
}

function handleColumn(column) {
  return repeatString(' ', column - oldColumn);
}

function handleLinenoAndColumn(_ref) {
  var lineno = _ref.lineno,
      column = _ref.column;

  return handleLineno(lineno) + handleColumn(column);
}

function findNodesType(list, type) {
  var nodes = nodesToJSON(list);
  return nodes.find(function (node) {
    return node.__type === type;
  });
}

function visitNode(node) {
  var handler = TYPE_VISITOR_MAP[node.__type];
  return handler ? handler(node) : '';
}

// 处理 nodes
function visitNodes() {
  var list = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];

  var text = '';
  var nodes = nodesToJSON(list);
  nodes.forEach(function (node) {
    text += visitNode(node);
  });
  return text;
}

// 处理 import；handler import
function visitImport(node) {
  var before = handleLineno(node.lineno) + '@import ';
  oldLineno = node.lineno;
  var quote = '';
  var text = '';
  var nodes = nodesToJSON(node.path.nodes || []);
  nodes.forEach(function (node) {
    text += node.val;
    if (!quote && node.quote) quote = node.quote;
  });
  return '' + before + quote + text + quote + ';';
}

function visitSelector(node) {
  var text = handleLinenoAndColumn(node);
  oldLineno = node.lineno;
  return text + visitNodes(node.segments);
}

function visitGroup(node) {
  var selector = visitNodes(node.nodes);
  var blockEnd = findNodesType(node.nodes, 'Selector') && selector || '';
  var endSymbol = handleColumn(node.column + 1 - trimFirstLinefeedLength(blockEnd));
  var block = visitBlock(node.block, endSymbol);
  return selector + block;
}

function visitBlock(node) {
  var suffix = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '';

  var before = ' {';
  var after = '\n' + suffix + '}';
  var text = visitNodes(node.nodes);
  return '' + before + text + after;
}

function visitLiteral(node) {
  return node.val || '';
}

function visitProperty(node) {
  var before = handleLinenoAndColumn(node);
  oldLineno = node.lineno;
  return before + visitNodes(node.segments) + ': ' + visitExpression(node.expr) + ';';
}

function visitIdent(node) {
  var val = node.val && node.val.toJSON() || '';
  if (val.__type === 'Null' || !val) return node.name;
  if (val.__type === 'Function') {
    return visitFunction(val);
  } else {
    var before = handleLineno(node.lineno);
    oldLineno = node.lineno;
    return before + replaceFirstATSymbol(node.name) + ' = ' + visitNode(val) + ';';
  }
}

function visitExpression(node) {
  var result = visitNodes(node.nodes);
  if (!returnSymbol || isIfExpression) return result;
  var before = '\n';
  before += handleColumn(node.column + 1 - result.length);
  return before + returnSymbol + result;
}

function visitCall(node) {
  var before = handleLineno(node.lineno);
  oldLineno = node.lineno;
  return before + node.name + '(' + visitArguments(node.args) + ');';
}

function visitArguments(node) {
  var nodes = nodesToJSON(node.nodes);
  var text = '';
  nodes.forEach(function (node, idx) {
    var prefix = idx ? ', ' : '';
    text += prefix + visitNode(node);
  });
  return text || '';
}

function visitRGBA(node, prop) {
  return node.raw;
}

function visitUnit(node) {
  return node.val + node.type;
}

function visitBoolean(node) {
  return node.val;
}

function visitIf(node) {
  var symbol = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : '@if ';

  var before = '';
  isIfExpression = true;
  var condText = visitExpression(node.cond);
  isIfExpression = false;
  var condLen = node.column - (condText.length + 2);
  if (symbol === '@if ') {
    before += handleLineno(node.lineno);
    oldLineno = node.lineno;
    before += handleColumn(condLen);
  }
  var block = visitBlock(node.block, handleColumn(condLen));
  var elseText = '';
  if (node.elses && node.elses.length) {
    var elses = nodesToJSON(node.elses);
    elses.forEach(function (node) {
      if (node.__type === 'If') {
        elseText += visitIf(node, ' @else if ');
      } else {
        elseText += ' @else' + visitBlock(node, handleColumn(condLen));
      }
    });
  }
  return before + symbol + condText + block + elseText;
}

function visitFunction(node) {
  var isFn = !findNodesType(node.block.nodes, 'Property');
  var hasIf = findNodesType(node.block.nodes, 'If');
  var before = handleLineno(node);
  oldLineno = node.lineno;
  var symbol = isFn ? '@function ' : '@mixin ';
  var fnName = symbol + '(' + visitArguments(node.params) + ')';
  returnSymbol = '@return ';
  var block = visitBlock(node.block);
  returnSymbol = '';
  return before + fnName + block;
}

function visitBinOp(node) {
  return visitIdent(node.left) + ' ' + node.op + ' ' + visitIdent(node.right);
}

// 处理 stylus 语法树；handle stylus Syntax Tree
function visitor(ast, option) {
  var result = visitNodes(ast.nodes) || '';
  oldLineno = 1;
  return result;
}

function converter(result) {
  var option = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'scss';

  if (typeof result !== 'string') return result;
  var ast = new Parser(result).parse();
  return visitor(ast, option);
}

module.exports = converter;