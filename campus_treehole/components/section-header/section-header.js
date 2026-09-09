Component({
  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    actionText: { type: String, value: '' }
  },
  methods: {
    onAction() {
      this.triggerEvent('action')
    }
  }
})
