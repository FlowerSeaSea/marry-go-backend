var express = require("express");
const { listen } = require("../app");
var router = express.Router();
var connection = require("../DB/sql");
var user = require("../DB/userSql.js");
var QcloudSms = require("qcloudsms_js");
const { param } = require("./users");
let jwt=require('jsonwebtoken');
const req = require("express/lib/request");
// 引入支付宝配置文件
const alipaySdk = require('../DB/alipay.js')
const AlipayFormData = require('alipay-sdk/lib/form').default;
//引入axiso
const axios = require('axios');


function getTimeToken( exp ){
    
    let getTime = parseInt(  new Date().getTime() / 1000 );
    
    if(  getTime - exp  >  60 ){
        return true;
    }
    
} 

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
})

//支付状态
router.post('/api/successPayment',function(req,res,next){
  //token
  let token = req.headers.token;
  let tokenObj = jwt.decode(token);
  //订单号
  let out_trade_no = req.body.out_trade_no;
  let trade_no = req.body.trade_no;
  //支付宝配置
  const formData = new AlipayFormData();
  // 调用 setMethod 并传入 get，会返回可以跳转到支付页面的 url
  formData.setMethod('get');      
  //支付时信息
  formData.addField('bizContent', {
    out_trade_no,
    trade_no
  });
  //返回promise
  const result = alipaySdk.exec(
    'alipay.trade.query',
    {},
    { formData: formData },
  );
  //后端请求支付宝
  result.then(resData=>{
      axios({
          method:'GET',
          url:resData
      }).then(data=>{
          let responseCode = data.data.alipay_trade_query_response;
          if(  responseCode.code == '10000' ){
              switch(  responseCode.trade_status  ){
                  case 'WAIT_BUYER_PAY':
                      res.send({
                          data:{
                              code:0,
                              data:{
                                  msg:'支付宝有交易记录，没付款'
                              }
                          }
                      })
                  break;
                  
                  case 'TRADE_CLOSED':
                      res.send({
                          data:{
                              code:1,
                              data:{
                                  msg:'交易关闭'
                              }
                          }
                      })
                  break;
                  
                  case 'TRADE_FINISHED':
                      connection.query(`select * from user where tel = ${tokenObj.tel}`,function(error,results){
                          //用户id
                          let uId = results[0].id;
                          connection.query(`select * from store_order where uId = ${uId} and order_id = ${out_trade_no}`,function(err,result){
                              let id = result[0].id;
                              //订单的状态修改掉2==》3
                              connection.query(`update store_order set order_status = replace(order_status,'2','3') where id = ${id}`,function(){
                                  res.send({
                                      data:{
                                          code:2,
                                          data:{
                                              msg:'交易完成'
                                          }
                                      }
                                  })
                              })
                          })
                      })
                  break;
                  
                  case 'TRADE_SUCCESS':
                      connection.query(`select * from user where tel = ${tokenObj.tel}`,function(error,results){
                          //用户id
                          let uId = results[0].id;
                          connection.query(`select * from store_order where uId = ${uId} and order_id = ${out_trade_no}`,function(err,result){
                              let id = result[0].id;
                              //订单的状态修改掉2==》3
                              connection.query(`update store_order set order_status = replace(order_status,'2','3') where id = ${id}`,function(){
                                  res.send({
                                      data:{
                                          code:2,
                                          data:{
                                              msg:'交易完成'
                                          }
                                      }
                                  })
                              })
                          })
                      })
                  break;
              }
          }else if( responseCode.code == '40004' ){
              res.send({
                  data:{
                      code:4,
                      msg:'交易不存在'
                  }
              })
          }
      }).catch( err=>{
          res.send({
              data:{
                  code:500,
                  msg:'交易失败',
                  err
              }
          })
      })
  })
})
//发起支付
router.post('/api/payment',function(req,res,next){
  //订单号
  let orderId = req.body.orderId;
  //商品总价
  let price = req.body.price;
  //购买商品的名称
  let name = req.body.name;
  //开始对接支付宝API
  const formData = new AlipayFormData();
  // 调用 setMethod 并传入 get，会返回可以跳转到支付页面的 url
  formData.setMethod('get');
  //支付时信息
  formData.addField('bizContent', {
    outTradeNo: orderId,//订单号
    productCode: 'FAST_INSTANT_TRADE_PAY',//写死的
    totalAmount: price,//价格
    subject: name,//商品名称
  });
  //支付成功或者失败跳转的链接
  formData.addField('returnUrl', 'http://localhost:8080/#/payment');
  //返回promise
  const result = alipaySdk.exec(
    'alipay.trade.page.pay',
    {},
    { formData: formData },
  );
  //对接支付宝成功，支付宝方返回的数据
  result.then(resp=>{
      res.send({
          data:{
              code:200,
              success:true,
              msg:'支付中',
              paymentUrl : resp
          }
      })
      console.log(resp)
  })
})
//修改订单状态
router.post('/api/submitOrder',function(req,res,next){
  //token
  let token = req.headers.token;
  let tokenObj = jwt.decode(token);
  //订单号
  let orderId = req.body.orderId;
  //购物车选中的商品id
  let shopArr = req.body.shopArr;
  //查询用户
  connection.query(`select * from user where tel = ${tokenObj.tel}`,function(error,results){
      //用户id
      let uId = results[0].id;
      connection.query(`select * from store_order where uId = ${uId} and order_id = ${orderId}`,function(err,result){
          //订单的数据库id
          let id = result[0].id;
          //修改订单状态 1==>2
          connection.query(`update store_order set order_status = replace(order_status,'1','2') where id = ${id}`,function(e,r){
              //购物车数据删除
              shopArr.forEach(v=>{
                  connection.query(`delete from goods_cart where id = ${v}`,function(){})
                  res.send({
                      data:{
                          code:200,
                          success:true
                      }
                  })
              })
          })
      })
  })
  
})
//查询订单
router.post('/api/selectOrder',function(req,res,next){
  //接收前端给后端的订单号
  let orderId = req.body.orderId;
  connection.query(`select * from store_order where order_id='${orderId}'`,function(err,result){
       res.send({
          data:{
               success:true,
               code:200,
               data:result
          }
       })
  })
})

//生成一个订单
router.post('/api/addOrder',function(req,res,next){
  //token
  let token = req.headers.token;
  let tokenObj = jwt.decode(token);
  //前端给后端的数据
  let goodsArr = req.body.arr;
  //生成订单号order_id，规则：时间戳 + 6为随机数
  function setTimeDateFmt( s ){
      return s < 10 ? '0' + s : s
  }
  function randomNumber(){
      const now = new Date();
      let month = now.getMonth() + 1;
      let day = now.getDate();
      let hour = now.getHours();
      let minutes = now.getMinutes();
      let seconds = now.getSeconds();
      month = setTimeDateFmt(month);
      day = setTimeDateFmt(day);
      hour = setTimeDateFmt(hour);
      minutes = setTimeDateFmt(minutes);
      seconds = setTimeDateFmt(seconds);
      let orderCode = now.getFullYear().toString() + month.toString() + day + hour + minutes + seconds + (Math.round(Math.random() * 1000000 )).toString();
      return orderCode;
  }
  /*
  未支付：1
  待支付：2
  支付成功：3
  支付失败：4 | 0
  */
  //商品列表名称
  let goodsName = [];
  //订单商品总金额
  let goodsPrice = 0;
  //订单商品总数量
  let goodsNum = 0;
  //订单号
  let orderId = randomNumber();
  
  goodsArr.forEach(v=>{
      goodsName.push( v.goods_name );
      goodsPrice += v.goods_price * v.goods_num;
      goodsNum += parseInt(v.goods_num);
  })
  //查询当前用户
  connection.query(`select * from user where tel = ${tokenObj.tel}`,function(error,results){
      //用户id
      let uId = results[0].id;
      connection.query(`insert into store_order (order_id,goods_name,goods_price,goods_num,order_status,uId) values ('${ orderId }','${goodsName}','${goodsPrice}','${goodsNum}','1',${uId})`,function(){
          connection.query(`select * from store_order where uId = ${uId} and order_id='${orderId}'`,function(err,result){
               res.send({
                   data:{
                       success:true,
                       code:200,
                       data:result
                   }
               })
          })
      })
  })
  
})

//删除收货地址
router.post('/api/deleteAddress',function(req,res,next){
  let id = req.body.id;
  connection.query(`delete from address where id = ${id}`,function(error,results){
      res.send({
          data:{
              code:200,
              success:true,
              msg:'删除成功'
          }
      })
  })
})
//修改收货地址
router.post('/api/updateAddress',function(req,res,next){
  //token
  let token = req.headers.token;
  let tokenObj = jwt.decode(token);
  //拿到前端给后端传入的数据
  let body = req.body;
  let [id,name,tel,province,city,county,addressDetail,isDefault,areaCode] = [
      body.id,
      body.name,
      body.tel,
      body.province,
      body.city,
      body.county,
      body.addressDetail,
      body.isDefault,
      body.areaCode
  ];
  //查询用户
  connection.query(`select * from user where tel = ${tokenObj.tel}`,function(error,results){
      //用户id
      let uId = results[0].id;
      //对应查询到0 或者 1 有没有默认收货地址
      connection.query(`select * from address where uId = ${uId} and isDefault = ${isDefault}`,function(err,result){
        // 如果有默认地址则将默认更改为0，当前地址改为1
        if( result.length > 0 ){
              let addressId = result[0].id;
              connection.query(`update address isDefault = replace(isDefault,'1','0') where id = ${addressId}`,function(e,r){
                  let updateSql = `update address set uId = ? , name = ? , tel = ? , province = ? , city = ? ,county = ? , addressDetail = ? , isDefault = ? , areaCode = ? where id = ${id}`;
                  connection.query(updateSql,[uId,name,tel,province,city,county,addressDetail,isDefault,areaCode],function(errors,datas){
                      res.send({
                          data:{
                              code:200,
                              success:true,
                              msg:'修改成功'
                          }
                      })
                  })
              })
          }else{  //没有默认地址的话直接添加
              let updateSql = `update address set uId = ? , name = ? , tel = ? , province = ? , city = ? ,county = ? , addressDetail = ? , isDefault = ? , areaCode = ? where id = ${id}`;
              connection.query(updateSql,[uId,name,tel,province,city,county,addressDetail,isDefault,areaCode],function(errors,datas){
                  res.send({
                      data:{
                          code:200,
                          success:true,
                          msg:'修改成功'
                      }
                  })
              })
          }
      })
  })
})

//查询收货地址
router.post('/api/selectAddress',function(req,res,next){
  //token
  let token = req.headers.token;
  let tokenObj = jwt.decode(token);
  
    //如果执行，就证明token过期了
    if(  getTimeToken(tokenObj.exp) ){
      res.send({
          data:{
              code:1000
          }
      })
    }
  //查询用户
  connection.query(`select * from user where tel = ${tokenObj.tel}`,function(error,results){
      //用户id
      let uId = results[0].id;
      connection.query(`select * from address where uId = ${uId}`,function(err,result){
          res.send({
              data:{
                  code:200,
                  success:true,
                  msg:'查询成功',
                  data:result
              }
          })
      })
  })
})

//新增收货地址
router.post('/api/addAddress',function(req,res,next){
  //token
  let token = req.headers.token;
  let tokenObj = jwt.decode(token);
  //拿到前端给后端传入的数据
  let body = req.body;
  let [name,tel,province,city,county,addressDetail,isDefault,areaCode] = [
      body.name,
      body.tel,
      body.province,
      body.city,
      body.county,
      body.addressDetail,
      body.isDefault,
      body.areaCode
  ];
  //查询用户
  connection.query(`select * from user where tel = ${tokenObj.tel}`,function(error,results){
      //用户id
      let uId = results[0].id;
      //增加一条收货地址
      if(  isDefault != 1 ){
          connection.query(`insert into address (uId,name,tel,province,city,county,addressDetail,isDefault,areaCode) values (${uId},"${name}","${tel}","${province}","${city}","${county}","${addressDetail}","${isDefault}","${areaCode}")`,function(err,result){
            res.send({
                  data:{
                      code:200,
                      success:true,
                      msg:'收货地址添加成功'
                  }
              })
          })
      }else{
          connection.query(`select * from address where uId = ${uId} and isDefault = ${isDefault}`,function(err,result){
              if( result.length > 0 ){
                  let addressId = result[0].id;
                  // 将所有1改为0，然后在插入新的1
                  connection.query(`update address set isDefault = replace(isDefault,'1','0') where id = ${addressId}`,function(){
                      connection.query(`insert into address (uId,name,tel,province,city,county,addressDetail,isDefault,areaCode) values (${uId},"${name}","${tel}","${province}","${city}","${county}","${addressDetail}","${isDefault}","${areaCode}")`,function(e,r){
                          res.send({
                              data:{
                                  code:200,
                                  success:true,
                                  msg:'收货地址添加成功'
                              }
                          })
                      })
                  })
              }else{
                  connection.query(`insert into address (uId,name,tel,province,city,county,addressDetail,isDefault,areaCode) values (${uId},"${name}","${tel}","${province}","${city}","${county}","${addressDetail}","${isDefault}","${areaCode}")`,function(err,result){
                      res.send({
                          data:{
                              code:200,
                              success:true,
                              msg:'收货地址添加成功'
                          }
                      })
                  })
              }
          })
      }
  })
});

//修改購物車數量
router.post('/api/updateNum',function(req,res,next){

  let id=req.body.id , changeNum=req.body.num
  connection.query(`select * from goods_cart where id = ${id}`,function(error,result){
    //原來的數量
    let num = result[0].goods_num
    connection.query(`update goods_cart set goods_num = replace(goods_num,${num},${changeNum}) where id = ${id}`,function(err,rest){
      res.send({
        data:{
          code:200,
          success:true,
        }
      })
    })
  })
});

// 删除购物车数据
router.post('/api/deleteCart',function(req,res,next){
  let id=req.body.arrId
  for (let i = 0; i < id.length; i++) {
    connection.query(`delete from goods_cart where id = ${id[i]}`,function(err,rt){
      res.send({
        data:{
          code:200,
          success:true,
          msg:'删除成功'
        }
      })
    })
  }
});

//查询购物车数据
router.post('/api/selectCart',function(req,res,next){
  //token
  let token = req.headers.token;
  let tokenObj = jwt.decode(token);

    //如果执行，就证明token过期了
    if(  getTimeToken(tokenObj.exp) ){
      res.send({
          data:{
              code:1000
          }
      })
    }
  //查询用户
  connection.query(`select * from user where tel = ${tokenObj.tel}`,function(error,results){
      //用户id
      let uId = results[0].id;
      //查询购物车
      connection.query(`select * from goods_cart where uId = ${uId}`,function(err,result){
          res.send({
              data:{
                  code:200,
                  success:true,
                  data:result
              }
          })
      })
  })
});

// 添加购物车
router.post("/api/addCart", function (req, res, next) {
  let goodsId = req.body.goodsId;
  let token = req.headers.token;
  // 解析token
  let tokenObj = jwt.decode(token);
  console.log(tokenObj);
  //如果执行，就证明token过期了
  if(  getTimeToken(tokenObj.exp) ){
    res.send({
        data:{
            code:1000
        }
    })
  }
  //查询用户
  connection.query(`select * from user where tel = ${tokenObj.tel}`,function(error,result){
    let uId=result[0].id
    connection.query(`select * from goods_list where id=${goodsId}`,function(err,resu){
      let goodsName=resu[0].name,
      goodsPrice=resu[0].price,
      goodsImgUrl=resu[0].imgUrl
      // 查询用户之前是否添加过该商品
      connection.query(`select * from goods_cart where uId=${uId} and goods_id=${goodsId}`,function(er,re){
        if(re.length>0){
          let num = re[0].goods_num //不能放到判断外，因为没有数据的话获取不到num
          connection.query(`update goods_cart set goods_num = replace(goods_num,${num},${parseInt(num)+1}) where id = ${re[0].id}`,function(errr,reee){
            res.send({
              data:{
                code:200,
                success:true,
                msg:'添加成功'            
              }
            })
          })
        }else{
          connection.query(`insert into goods_cart (uId,goods_id,goods_name,goods_price,goods_num,goods_imgUrl) values ("${uId}","${goodsId}","${goodsName}","${goodsPrice}","1","${goodsImgUrl}")`,function(e,r){
            res.send({
              data:{
                code:200,
                success:true,
                msg:'添加成功'            
              }
            })
          })
        }
      })
    })
  })

});


/*修改密码 */
router.post("/api/recovery", function (req, res, next) {
  let params={
    userTel:req.body.phone,
    userPwd:req.body.pwd
  }
  connection.query(user.queryUserTel(params), function (error, result) {
    if (error) throw error;
    if (result.length > 0) {
      // let id=result[0].id
      // let pwd=result[0].pwd  //修改之前的pwd
      //使用es6模板字符串
      // connection.query(`UPDATE user SET pwd = replace(pwd,${pwd},${params.userPwd}) where id=${id}`,function(e,r){
      params.id=result[0].id
      params.pwd=result[0].pwd
      connection.query(user.updataInfo(params),function(e,r){
        if (error) throw error;
        if (result.length > 0) {
          res.send({
            code:200,
            data:{
              success:true,
              msg:'修改成功'
            }
          })
        }
      })
    }
  })
});


// 找回密码前查询用户是否存在
router.post("/api/selectUser", function (req, res, next) {
  let params={
    userTel:req.body.phone
  }
  connection.query(user.queryUserTel(params), function (error, result) {
    if (error) throw error;
    if (result.length > 0) {
      res.send({
        code:200,
        data:{
          success:true,
          data:result[0]
        }
      })
    }else{
      res.send({
        code:0,
        data:{
          success:false,
          msg:'无此用户，请先注册',
        }
      })
    }
  })
});

//注册
router.post("/api/register", function (req, res, next) {
  let params = {
    userTel: req.body.phone,
    userPwd: req.body.pwd,
  };
  // 先判断是否存在
  connection.query(user.queryUserTel(params), function (error, result) {
    if (error) throw error;
    if (result.length > 0) {
      res.send({
        code: 200,
        data: {
          success: true,
          msg: "账号已存在，去登录吧",
          data: result[0],
        },
      });
    } else {
      // 不存在，新增
      connection.query(user.inserData(params), function (err, result) {
        if (err) throw err;
        // 新增完还得查询出来
        connection.query(user.queryUserTel(params), function (e, r) {
          if (e) throw e;
          res.send({
            code: 200,
            data: {
              success: true,
              msg: "注册成功",
              data: r[0],
            },
          });
        });
      });
    }
  });
});

/* 验证码登录，。没有就增加用户 */
router.post("/api/addUser", function (req, res, next) {
  let params = {
    userTel: req.body.phone,
  };
  
  // 先判断是否存在
  connection.query(user.queryUserTel(params), function (error, result) {
    if (error) throw error;
    if (result.length > 0) {
      res.send({
        code: 200,
        data: {
          success: true,
          msg: "登录成功",
          data: result[0],
        },
      });
    } else {
      // 不存在，新增
      connection.query(user.inserData(params), function (err, result) {
        // 新增完还得查询出来
        connection.query(user.queryUserTel(params), function (e, r) {
          if (e) throw e;
          res.send({
            code: 200,
            data: {
              success: true,
              msg: "登录成功",
              data: r[0],
            },
          });
        });
      });
    }
  });
});

/* 发送短信验证码接口 */
router.post("/api/code", function (req, res, next) {
  let tel = req.body.phone;

  // 短信应用SDK AppID
  var appid = 1400187558; // SDK AppID是1400开头

  // 短信应用SDK AppKey
  var appkey = "dc9dc3391896235ddc2325685047edc7";

  // 需要发送短信的手机号码
  var phoneNumbers = [tel];

  // 短信模板ID，需要在短信应用中申请
  var templateId = 285590; // NOTE: 这里的模板ID`7839`只是一个示例，真实的模板ID需要在短信控制台中申请

  // 签名
  var smsSign = "丘比特"; // NOTE: 这里的签名只是示例，请使用真实的已申请的签名, 签名参数使用的是`签名内容`，而不是`签名ID`

  // 实例化QcloudSms
  var qcloudsms = QcloudSms(appid, appkey);

  // 设置请求回调处理, 这里只是演示，用户需要自定义相应处理回调
  function callback(err, ress, resData) {
    if (err) {
      console.log("err: ", err);
    } else {
      res.send({
        code: 200,
        data: {
          success: true,
          data: ress.req.body.params[0],
        },
      });
    }
  }

  var ssender = qcloudsms.SmsSingleSender();
  //params验证码
  var params = [Math.floor(Math.random() * (9999 - 1000)) + 1000];
  ssender.sendWithParam(
    86,
    phoneNumbers[0],
    templateId,
    params,
    smsSign,
    "",
    "",
    callback
  ); // 签名参数不能为空串
});

/* 手机号密码验证接口 */
router.post("/api/login", function (req, res, next) {
  // 接受数据
  let params = {
    userTel: req.body.userTel,
    userPwd: req.body.userPwd,
  };
// 每次登录都生成新的token
  let userTel=params.userTel

  // 引入token包
  let jwt=require('jsonwebtoken')
  // 用户信息
  let payload={tel:userTel}
  // 口令
  let secret='wenquanhai'
  // 生成token
  let token=jwt.sign(payload,secret,{
      expiresIn:6000
  });

  // 手机号密码验证
  connection.query(user.queryUserTel(params), function (error, results) {
    //手机号存在
    if (results.length > 0) {
      // 记录的id
      let id =results[0].id;

      connection.query(user.queryUserPwd(params), function (error, result) {
        if (result.length > 0) {
          connection.query(`update user set token = '${token}' where id = ${id}`,function(){
            res.send({
              code: 200,
              data: {
                success: true,
                msg: "登陆成功",
                data: result[0],
              },
            });
          })
        } else {
          res.send({
            code: 302,
            data: {
              success: false,
              msg: "密码不正确",
            },
          });
        }
      });
    } else {
      res.send({
        code: 301,
        data: {
          success: false,
          msg: "手机号未注册",
        },
      });
    }
  });
});

/* 查询商品id */
router.get("/api/goods/id", function (req, res, next) {
  let id = req.query.id;
  connection.query(
    "select * from goods_list where id=" + id + "",
    function (error, result) {
      if (error) throw error;
      res.send({
        code: 0,
        data: result[0],
      });
    }
  );
});

// 查询商品数据接口
router.get("/api/goods/shopList", function (req, res, next) {
  // 后端接收的数据
  let [searchName, shopStatus, showStatus] = Object.keys(req.query);
  let [name, status, status1] = Object.values(req.query);
  let price = status1 === "价格排序" ? "price" : "";
  let num = status1 === "销量排序" ? "num" : "";

  // console.log(searchName,shopStatus,showStatus,name,status,status1);
  if (price != "") {
    connection.query(
      'select * from goods_list where name like "%' +
        name +
        '%" order by ' +
        price +
        " desc",
      function (error, result) {
        res.send({
          code: 0,
          data: result,
        });
      }
    );
  } else if (num != "") {
    connection.query(
      'select * from goods_list where name like "%' +
        name +
        '%" order by ' +
        num +
        " asc",
      function (error, result) {
        res.send({
          code: 0,
          data: result,
        });
      }
    );
  } else {
    connection.query(
      'select * from goods_list where name like "%' + name + '%" ',
      function (error, result) {
        res.send({
          code: 0,
          data: result,
        });
      }
    );
  }
});

router.get("/api/message/title", function (req, res, next) {
  res.send({
    code:200,
    data: [
      {
        title: "first",
        list1: [
          { id: 1, type: "list", name: "张三", text: "撒大声地" },
          { id: 1, type: "list", name: "张三", text: "撒大声地" },
          { id: 1, type: "list", name: "张三", text: "撒大声地" },
          { id: 1, type: "list", name: "张三", text: "撒大声地" },
        ],
      },
      {
        title: "second",
        list1: [
          { id: 1, type: "list", name: "lisi", text: "asdjadal;" },
          { id: 1, type: "list", name: "lisi", text: "asdjadal;" },
          { id: 1, type: "list", name: "lisi", text: "asdjadal;" },
          { id: 1, type: "list", name: "lisi", text: "asdjadal;" },
        ],
      },
      {
        title: "third",
        list1: [
          { id: 1, type: "list", name: "lisdsfjsi", text: "asdqroqpwqjadal;" },
          { id: 1, type: "list", name: "lisdsfjsi", text: "asdqroqpwqjadal;" },
          { id: 1, type: "list", name: "lisdsfjsi", text: "asdqroqpwqjadal;" },
          { id: 1, type: "list", name: "lisdsfjsi", text: "asdqroqpwqjadal;" },
        ],
      },
    ],
  });
});

module.exports = router
