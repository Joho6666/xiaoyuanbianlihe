Component({
  properties: { title: String, description: String, icon: String, tone: { type: String, value: 'blue' }, badge: String },
  methods: { onTap() { this.triggerEvent('tap') } }
})
