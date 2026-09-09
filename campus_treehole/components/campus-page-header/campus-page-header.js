Component({
  properties: {
    title: { type: String, value: '' },
    subtitle: { type: String, value: '' },
    showBack: { type: Boolean, value: false },
    campus: { type: String, value: '' },
    accent: { type: String, value: 'blue' }
  },
  methods: {
    onBack() {
      this.triggerEvent('back')
    },
    onCampusTap() {
      this.triggerEvent('campus')
    }
  }
})
