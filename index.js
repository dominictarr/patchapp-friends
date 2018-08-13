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

        var friends = h('div.avatar__relation')
        var follows = h('div.avatar__relation')
        var followers = h('div.avatar__relation')

        function append (el, id, cb) {
          el.appendChild(h('a', {href: id}, image(id, cb)))
        }

        //categories:
        //friends, follows, followers
        //mutual friends, friends that you follow, friends that follow you, other friends
        var data = {followers: null, follows: null}
        api.sbot.friends.get({source: id}, function (err, follows) {
          data.follows = follows
          if(data.follows && data.followers) next()
        })

        api.sbot.friends.get({dest: id}, function (err, followers) {
          data.followers = followers
          if(data.follows && data.followers) next()
        })

        function slowAdd (set, fn) {
          pull(
            pull.values(set),
            paramap(function (k, cb) {
              setImmediate(function () {
//                cb(null, fn(k, cb))
                fn(k, cb)
              })
            }, 32),
            pull.drain()
          )
        }

        var countFriends = h('span.friends__count')
        var countFollows = h('span.follows__count')
        var countFollowers = h('span.followers__count')

        function next () {
          var keys_follows = []
          var keys_followers = []
          var keys_friends = []

          for(var k in data.follows)
            if(data.follows[k] && data.followers[k])
              keys_friends.push(k)
            else if(data.follows[k])
              keys_follows.push(k)
          for(var k in data.followers)
            if(!data.follows[k])
              keys_followers.push(k)

          countFriends.textContent = ' ('+keys_friends.length+')'
          countFollows.textContent = ' ('+keys_follows.length+')'
          countFollowers.textContent = ' ('+keys_followers.length+')'

          var show = 84

          slowAdd(keys_friends.slice(0, show), function (k, cb) {
            append(friends, k, cb)
          })
          slowAdd(keys_follows.slice(0, show), function (k, cb) {
            append(follows, k, cb)
          })
          slowAdd(keys_followers.slice(0, show), function (k, cb) {
            append(followers, k, cb)
          })
        }

        return h('div.Avatar__view',
          h('div.Avatar__header',
            h('h1', api.identity.main() == id ? 'you are: ' : 'this is: ', api.avatar.name(id)), image(id)
          ),
          //actions: follow, etc
          h('div.Avatar__actions', api.avatar.action(id)),
          h('div.friends',
            h('h2', 'Friends', countFriends),
            friends
          ),
          h('div.followers',
            h('h2', 'Followers', countFollowers),
            followers
          ),
          h('div.follows',
            h('h2', 'Follows', countFollows),
            follows
          )
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












