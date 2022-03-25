// 验证数据库中用户数据
const User={
    // 查询用户手机
    queryUserTel(option){
        return 'select * from user where tel='+option.userTel+''; 
    },
    // 查询用户密码
    queryUserPwd(option){
        return 'select * from user where (tel='+option.userTel+') and pwd = '+option.userPwd+''; 
    },
    // 新增用户
    inserData(option){
        let userTel=option.userTel,
        userPwd=option.userPwd || "123456",
        imgUrl=option.imgUrl || "/images/goods1.png",
        nickName=option.nickName || "默认"
        // 引入token包
        let jwt=require('jsonwebtoken')
        // 用户信息
        let payload={tel:userTel}
        // 口令
        let secret='wenquanhai'
        // 生成token
        let token=jwt.sign(payload,secret,{
            expiresIn:6000
        })

        return 'insert into user (tel,pwd,imgUrl,nickName,token) values ("' +userTel+ '","'+userPwd+'","'+imgUrl+'","'+nickName+'","'+token+'")';
    },

    updataInfo(option){
        let id=option.id,
        pwd=option.pwd,//之前的密码
        userPwd=option.userPwd || pwd,
        imgUrl=option.imgUrl|| "/images/goods1.png",
        nickName=option.nickName|| "默认"
        return 'UPDATE user SET pwd='+userPwd+',imgUrl="'+imgUrl+'",nickName="'+nickName+'" WHERE id='+id+''
    }
}
exports = module.exports = User