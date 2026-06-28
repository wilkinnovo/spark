; Spark components reuse the tree-sitter-html grammar.
(tag_name) @tag
(erroneous_end_tag_name) @tag
(attribute_name) @attribute
(attribute_value) @string
(quoted_attribute_value) @string
(comment) @comment
(doctype) @constant

"<" @punctuation.bracket
">" @punctuation.bracket
"</" @punctuation.bracket
"/>" @punctuation.bracket
"=" @operator
