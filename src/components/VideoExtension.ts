import { Node, mergeAttributes } from '@tiptap/core';

export const VideoNode = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
      class: { default: 'uploaded-video' },
    };
  },

  parseHTML() {
    return [{ tag: 'video' }, { tag: 'div.video-wrapper' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      { class: 'video-wrapper' },
      ['video', mergeAttributes({ controls: 'controls' }, HTMLAttributes)],
    ];
  },
});
