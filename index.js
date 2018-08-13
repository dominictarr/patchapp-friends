var isFeed = require('ssb-ref').isFeed
var h = require('hyperscript')
var pull = require('pull-stream')
var paramap = require('pull-paramap')

exports.gives = {
  app: { view: true },
  avatar: { action: true },
  message: { render: true }
}

exports.needs = {
  avatar: {
    name: 'first',
    image: 'first',
    action: 'map',
  },
  sbot: {
    friends: { get: 'first' }
  },
  identity: {
    main: 'first'
  },
  confirm: {
    show: 'first'
  }
}

var keys = Object.keys

function intersect (a, b) {
  var c = {}
  for(var k in a)
    if(b[k] == true && a[k] == true) c[k] = true
  return c
}

function subtract (a, b) {
  var c = {}
  for(var k in a)
    if(b[k] !== true && a[k] == true) c[k] = true
  return c
}

function each (o, fn) {
  for(var k in o)
    fn(k, o[k], o)
}

function clean (obj) {
  var _o = {}
  for(var k in obj)
    if(obj[k]) _o[k] = obj[k]
  return _o
}

function noop () {}

exports.create = function (api) {
  document.head.appendChild(h('style', {textContent:
    '.avatar__relation img { width: 32px; height: 32px; }\n' +
    '.avatar__relation { display: flex; flex-wrap: wrap; }'
  }))

  function amFollowing (id, cb) {
    api.sbot.friends.get({
      source: api.identity.main(),
      dest: id
    }, cb)
  }

  function image (id, cb) {
    var img = h('img')
    if(!cb) cb = noop
    api.avatar.image(id, function (src) { cb(null, img.src = src) })
    return img
  }


  return {
    app: {
      view: function (id) {

        if(!isFeed(id)) return

        function append (el, id, cb) {
          el.appendChild(h('a', {href: id}, image(id, cb)))
        }

        var relations = h('div.avatar_relations')

        //categories:
        //friends, follows, followers
        //mutual friends, friends that you follow, friends that follow you, other friends
        var data = {
          followers: null, follows: null,
          your_followers: null, you_follow: null
        }

        api.sbot.friends.get({source: id}, function (err, follows) {
          data.follows = clean(follows)
        })

        api.sbot.friends.get({dest: id}, function (err, followers) {
          data.followers = clean(followers)
          next()
        })
        api.sbot.friends.get({source: api.identity.main()}, function (err, follows) {
          data.you_follow = clean(follows)
          next()
        })
        api.sbot.friends.get({dest: api.identity.main()}, function (err, followers) {
          data.your_followers = clean(followers)
          next()
        })

        function slowAdd (set, fn) {
          pull(
            pull.values(set),
            paramap(function (k, cb) {
              setImmediate(function () {
                fn(k, cb)
              })
            }, 8),
            pull.drain()
          )
        }

        function next () {
          if(!(data.follows && data.followers && data.you_follow && data.your_followers)) return

          var friends = intersect(data.follows, data.followers)
          var your_friends =
            intersect(data.you_follow, data.your_followers)

          var follows = subtract(data.follows, friends)
          var followers = subtract(data.followers, friends)

          var follows_that_follow_you = intersect(follows, data.your_followers)
          var followers_you_follow = intersect(followers, data.you_follow)

    //      followers_you_follow = follows_that_follow_you = {}

          var sets = {
            mutual_friends: intersect(friends, your_friends),
            friends: subtract(friends, your_friends),
            follows_that_follow_you: follows_that_follow_you,
            follows: subtract(follows, follows_that_follow_you),
            followers_you_follow: followers_you_follow,
            followers: subtract(followers, followers_you_follow),
          }

          var show = 84

          each(sets, function (k, set) {
            var relation = h('div.avatar__relation')
            var ary = keys(set)
            relations.appendChild(h('div.avatar__relation_'+k,
              h('h2', k.replace(/_/g, ' '), ' (', ary.length, ')'),
              relation
            ))
            slowAdd(ary.slice(0, show), function (k, cb) {
              append(relation, k, cb)
            })
          })


//          countFriends.textContent = ' ('+keys_friends.length+')'
//          countFollows.textContent = ' ('+keys_follows.length+')'
//          countFollowers.textContent = ' ('+keys_followers.length+')'
//
//          var show = 84
//
//          slowAdd(keys_friends.slice(0, show), function (k, cb) {
//            append(friends, k, cb)
//          })
//          slowAdd(keys_follows.slice(0, show), function (k, cb) {
//            append(follows, k, cb)
//          })
//          slowAdd(keys_followers.slice(0, show), function (k, cb) {
//            append(followers, k, cb)
//          })
        }

        return h('div.Avatar__view',
          h('div.Avatar__header',
            h('h1', api.identity.main() == id ? 'you are: ' : 'this is: ', api.avatar.name(id)), image(id)
          ),
          //actions: follow, etc
          h('div.Avatar__actions', api.avatar.action(id)),
          relations
//          h('div.friends',
//            h('h2', 'Friends', countFriends),
//            friends
//          ),
//          h('div.followers',
//            h('h2', 'Followers', countFollowers),
//            followers
//          ),
//          h('div.follows',
//            h('h2', 'Follows', countFollows),
//            follows
//          )
        )

      }
    },
    avatar: {
      action: function (id) {
        var a
        //query amFollowing and set the text of the button.
        //this just re-queries the local database again after
        //hitting the button, unnecessary, but cleaner code
        //than also tracking the state in the button.

        //this pattern: some state, option to create a message
        //which changes that state, then rerender that state
        //is gonna be pretty common, could be abstracted
        //to maybe two templates (one to render the state,
        //one to shape the message) and it could be very easy to
        //add something. As this is currently it's pretty ugly.
        function setContent () {
          amFollowing(id, function (err, v) {
            a.textContent = v ? 'unfollow' : 'follow'
            a.title = v ? 'you follow them' : 'you do not follow them'
          })
        }
        a = h('a', {href: '#', onclick: function () {
          amFollowing(id, function (err, isFollowing) {
            api.confirm.show({
              type: 'contact', contact: id, following: true
            }, null, setContent)
          })
        }})

        setContent()
        return a

      }
    },
    message: {
      render: function (data) {

        if(data.content.type !== 'contact') return
        var id = data.content.contact
        var name = (
          data.content.following ? 'follows'
        : data.content.blocking ? 'blocks'
        : false
        )
        if(!name || !isFeed(id)) return

        return h('div',
          name,
          h('a',
            {href: id},
            api.avatar.name(id),
            image(id)
          )
        )

      }
    }
  }
}

