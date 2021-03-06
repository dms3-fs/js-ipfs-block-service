/* eslint-env mocha */
'use strict'

const chai = require('chai')
chai.use(require('dirty-chai'))
const expect = chai.expect

const Block = require('ipfs-block')
const _ = require('lodash')
const map = require('async/map')
const waterfall = require('async/waterfall')
const CID = require('cids')
const multihashing = require('multihashing-async')

const BlockService = require('../src')

module.exports = (repo) => {
  describe('block-service', () => {
    let bs

    before(() => {
      bs = new BlockService(repo)
    })

    describe('offline', () => {
      it('store and get a block', (done) => {
        const data = Buffer.from('A random data block')
        multihashing(data, 'sha2-256', (err, hash) => {
          expect(err).to.not.exist()
          const b = new Block(data, new CID(hash))

          waterfall([
            (cb) => bs.put(b, cb),
            (cb) => bs.get(b.cid, cb),
            (res, cb) => {
              expect(res).to.be.eql(b)
              cb()
            }
          ], done)
        })
      })

      it('get a non existent block', (done) => {
        const data = Buffer.from('Not stored')

        multihashing(data, 'sha2-256', (err, hash) => {
          expect(err).to.not.exist()
          bs.get(new CID(hash), (err, block) => {
            expect(err).to.exist()
            expect(block).to.not.exist()
            done()
          })
        })
      })

      it('store many blocks', (done) => {
        const data = [Buffer.from('1'), Buffer.from('2'), Buffer.from('3')]
        map(data, (d, cb) => {
          multihashing(d, 'sha2-256', (err, hash) => {
            expect(err).to.not.exist()
            cb(null, new Block(d, new CID(hash)))
          })
        }, (err, blocks) => {
          expect(err).to.not.exist()
          bs.putMany(blocks, done)
        })
      })

      it('get many blocks', (done) => {
        const data = [Buffer.from('1'), Buffer.from('2'), Buffer.from('3')]
        waterfall([
          (cb) => map(data, (d, cb) => {
            multihashing(d, 'sha2-256', (err, hash) => {
              expect(err).to.not.exist()
              cb(null, new Block(d, new CID(hash)))
            })
          }, cb),
          (blocks, cb) => map(
            blocks,
            (b, cb) => bs.get(b.cid, cb),
            (err, res) => {
              expect(err).to.not.exist()
              expect(res).to.be.eql(blocks)
              cb()
            }
          )
        ], done)
      })

      it('delete a block', (done) => {
        const data = Buffer.from('Will not live that much')
        multihashing(data, 'sha2-256', (err, hash) => {
          expect(err).to.not.exist()
          const b = new Block(data, new CID(hash))

          waterfall([
            (cb) => bs.put(b, cb),
            (cb) => bs.delete(b.cid, cb),
            (cb) => bs._repo.blocks.has(b.cid, cb),
            (res, cb) => {
              expect(res).to.be.eql(false)
              cb()
            }
          ], done)
        })
      })

      it('stores and gets lots of blocks', function (done) {
        this.timeout(8 * 1000)

        const data = _.range(1000).map((i) => {
          return Buffer.from(`hello-${i}-${Math.random()}`)
        })

        map(data, (d, cb) => {
          multihashing(d, 'sha2-256', (err, hash) => {
            expect(err).to.not.exist()
            cb(null, new Block(d, new CID(hash)))
          })
        }, (err, blocks) => {
          expect(err).to.not.exist()
          bs.putMany(blocks, (err) => {
            expect(err).to.not.exist()

            map(blocks, (b, cb) => bs.get(b.cid, cb), (err, res) => {
              expect(err).to.not.exist()
              expect(res).to.be.eql(blocks)
              done()
            })
          })
        })
      })

      it('sets and unsets exchange', () => {
        bs = new BlockService(repo)
        bs.setExchange({})
        expect(bs.hasExchange()).to.be.eql(true)
        bs.unsetExchange()
        expect(bs.hasExchange()).to.be.eql(false)
      })
    })

    describe('has exchange', () => {
      beforeEach(() => {
        bs = new BlockService(repo)
      })

      it('hasExchange returns true when online', () => {
        bs.setExchange({})
        expect(bs.hasExchange()).to.be.eql(true)
      })

      it('retrieves a block through bitswap', (done) => {
        // returns a block with a value equal to its key
        const bitswap = {
          get (cid, callback) {
            callback(null, new Block(Buffer.from('secret'), cid))
          }
        }

        bs.setExchange(bitswap)

        const data = Buffer.from('secret')

        waterfall([
          (cb) => multihashing(data, 'sha2-256', cb),
          (hash, cb) => bs.get(new CID(hash), cb),
          (block, cb) => {
            expect(block.data).to.be.eql(data)
            cb()
          }
        ], done)
      })

      it('puts the block through bitswap', (done) => {
        const puts = []
        const bitswap = {
          put (block, callback) {
            puts.push(block)
            callback()
          }
        }
        bs.setExchange(bitswap)

        const data = Buffer.from('secret sauce')

        waterfall([
          (cb) => multihashing(data, 'sha2-256', cb),
          (hash, cb) => bs.put(new Block(data, new CID(hash)), cb)
        ], (err) => {
          expect(err).to.not.exist()
          expect(puts).to.have.length(1)
          done()
        })
      })
    })
  })
}
