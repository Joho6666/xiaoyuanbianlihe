Component({properties:{item:{type:Object,value:{}},revealed:Boolean},methods:{onReveal(){this.triggerEvent('reveal')},onLike(){this.triggerEvent('like')},onPass(){this.triggerEvent('pass')}}})
