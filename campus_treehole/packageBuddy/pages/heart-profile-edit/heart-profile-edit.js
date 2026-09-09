const app=getApp()
Page({
 data:{busy:false,error:'',photos:[],bio:'',lookingFor:'',grade:'',interests:'',genders:['男','女','其他'],genderValues:['male','female','other'],genderIndex:0,preferences:[],adultDeclared:false,enabled:false,allowFateCard:false},
 async onLoad(){try{const r=await app.callDB('getHeartProfile');if(r.code!==0)throw Error(r.msg);const p=r.data;if(p.enabled)this.setData({...p,interests:(p.interestIds||[]).join('、'),genderIndex:this.data.genderValues.indexOf(p.gender),preferences:p.interestedIn||[],maleSelected:(p.interestedIn||[]).includes('male'),femaleSelected:(p.interestedIn||[]).includes('female'),otherSelected:(p.interestedIn||[]).includes('other')})}catch(e){this.setData({error:e.message})}},
 input(e){this.setData({[e.currentTarget.dataset.field]:e.detail.value})},
 gender(e){this.setData({genderIndex:Number(e.detail.value)})},
 preferences(e){this.setData({preferences:e.detail.value})},
 consent(e){const values=e.detail.value;this.setData({adultDeclared:values.includes('adult'),enabled:values.includes('enabled'),allowFateCard:values.includes('fate')})},
 async photos(){if(this.data.busy)return;this.setData({busy:true});try{const selected=await wx.chooseMedia({count:3-this.data.photos.length,mediaType:['image'],sourceType:['album','camera']});const files=[];for(const file of selected.tempFiles){const r=await wx.cloud.uploadFile({cloudPath:'heart/'+Date.now()+'-'+Math.random().toString(36).slice(2)+'.jpg',filePath:file.tempFilePath});files.push(r.fileID)}this.setData({photos:this.data.photos.concat(files)})}catch(e){this.setData({error:e.errMsg||e.message})}finally{this.setData({busy:false})}},
 remove(e){const photos=this.data.photos.slice();photos.splice(e.currentTarget.dataset.index,1);this.setData({photos})},
 async save(){if(this.data.busy)return;this.setData({busy:true,error:''});try{const d=this.data;const r=await app.callDB('updateHeartProfile',{enabled:d.enabled,adultDeclared:d.adultDeclared,allowFateCard:d.allowFateCard,gender:d.genderValues[d.genderIndex],interestedIn:d.preferences,grade:d.grade,photos:d.photos,bio:d.bio,lookingFor:d.lookingFor,interestIds:d.interests.split(/[、,，]/).map(x=>x.trim()).filter(Boolean)});if(r.code!==0)throw Error(r.msg);wx.navigateBack()}catch(e){this.setData({error:e.message})}finally{this.setData({busy:false})}}
})
