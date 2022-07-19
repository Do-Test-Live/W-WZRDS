const AssassinateApp = {
    components: [],

    data() {
        return {
            web3Modal: null,
            web3Provider: null,
            web3: null,
            mintContract: null,
            shroomsContract: null,
            skullContract: null,
            assassinateContract: null,

            connected: false,
            loading: true,
            successful: false,

            address: null,
            targets: [],
            totalOwnedShrooms: 0,
            totalOwnedSkulls: 0,
            costToKillShrooms: 0,
            selectedTarget: null,

            leaderboard: {
                killer: {},
                victim: {}
            },

            cachedTokenMetadata: JSON.parse(window.localStorage.getItem('cachedTokenMetadata')) || {}
        };
    },

    async created() {
        await this.initializeWeb3();

        if (window.localStorage.getItem('entered-assassinate') == 1) {
            await this.connectWallet();
        }
    },

    methods: {
        async initializeWeb3() {
            this.web3Modal = new Web3Modal.default({
                cacheProvider: true,
                providerOptions: {
                    walletconnect: {
                        package: WalletConnectProvider.default,
                        options: {
                            rpc: {
                                1: 'https://cloudflare-eth.com/'
                            }
                        }
                    }
                }
            });

            this.loading = false;
        },

        async connectWallet() {
            try {
                this.web3Provider = await this.web3Modal.connect();
            } catch (err) {
                alert(`Connect failed: ${err.message || 'Canceled by user'}`);
                return;
            }

            this.web3 = new Web3(this.web3Provider);

            let chainId = await this.web3.eth.getChainId();

            if (chainId !== MintContract.chainId) {
                alert(`You're on the wrong network. Please swap to the Ethereum mainnet!`);
                return;
            }

            this.mintContract = new this.web3.eth.Contract(MintContract.abi, MintContract.address);
            this.shroomsContract = new this.web3.eth.Contract(ShroomsContract.abi, ShroomsContract.address);
            this.skullContract = new this.web3.eth.Contract(SkullContract.abi, SkullContract.address);
            this.assassinateContract = new this.web3.eth.Contract(AssassinateContract.abi, AssassinateContract.address);

            let accounts = await this.web3.eth.requestAccounts();

            this.connected = true;
            this.address = accounts[0];

            window.localStorage.setItem('entered-assassinate', 1);

            await this.updateTargets();
            await this.updateShroomsBalance();
            await this.updateSkullBalance();
            await this.updateLeaderboard();
        },

        async updateTargets() {
            this.loading = true;

            try {
                let response = await window.axios.get('/peddler/targets');
                let targets = [];

                response.data.targets = response.data.targets.sort((a, b) => {
                    return 0.5 - Math.random();
                });

                for (let target of response.data.targets) {
                    try {
                        let currentOwner = await this.mintContract.methods.ownerOf(target.token_id).call();

                        if (target.owner_address == currentOwner.toLowerCase()) {
                            targets.push(target);

                            if (targets.length === 4) {
                                break;
                            }
                        }
                    } catch (err) {}
                }

                this.targets = targets;
                this.costToKillShrooms = targets.length > 0 ? parseInt(this.web3.utils.fromWei(targets[0].shroom_cost)) : 0;
            } catch (err) {
                alert(`Update failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async updateShroomsBalance() {
            this.loading = true;

            try {
                this.totalOwnedShrooms = parseInt(this.web3.utils.fromWei(await this.shroomsContract.methods.balanceOf(this.address).call()));
            } catch (err) {
                alert(`Update failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async updateSkullBalance() {
            this.loading = true;

            try {
                this.totalOwnedSkulls = parseInt(await this.skullContract.methods.balanceOf(this.address, 0).call());
            } catch (err) {
                alert(`Update failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async updateLeaderboard() {
            this.loading = true;

            try {
                let response = await window.axios.get('/peddler/leaderboard');
                let leaderboard = {};

                leaderboard.killer = response.data.killer.slice(0, 5);
                leaderboard.victim = response.data.victim.slice(0, 5);

                this.leaderboard = leaderboard;
            } catch (err) {
                alert(`Update failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async selectTarget(target) {
            if (this.successful) {
                return;
            }

            this.selectedTarget = target;
        },

        async assassinateTarget() {
            this.loading = true;

            try {
                let transaction = await this.assassinateContract.methods.assassinate(this.selectedTarget.proof, this.selectedTarget.token_id, this.selectedTarget.shroom_cost, this.selectedTarget.owner_address, this.selectedTarget.expires_at, this.selectedTarget.nonce).send({
                    from: this.address
                });

                await this.updateShroomsBalance();
                await this.updateSkullBalance();

                this.successful = true;

                this.$forceUpdate();
            } catch (err) {
                alert(`Assassination failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        getTokenMetadata(tokenId) {
            if (!(tokenId in this.cachedTokenMetadata)) {
                this.cachedTokenMetadata[tokenId] = {
                    name: '...',
                    image: null,
                    loading: true
                };

                this.fetchTokenMetadata(tokenId);
            }

            return this.cachedTokenMetadata[tokenId];
        },

        async fetchTokenMetadata(tokenId) {
            let response = await axios.get(`/metadata/${tokenId}`);

            this.cachedTokenMetadata[tokenId] = response.data;

            window.localStorage.setItem('cachedTokenMetadata', JSON.stringify(this.cachedTokenMetadata));

            this.$forceUpdate();
        }
    }
};
