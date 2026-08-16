import { Node, mergeAttributes } from '@tiptap/core';

export const WidgetEmbed = Node.create({
  name: 'widgetEmbed',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      widgetId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-widget-id'),
        renderHTML: (attributes) => ({
          'data-widget-id': attributes.widgetId,
        }),
      },
      widgetLabel: {
        default: '',
        parseHTML: (element) => element.textContent || '',
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-widget-id]',
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'widget-embed' }),
      node.attrs.widgetLabel || 'חלונית',
    ];
  },
});
