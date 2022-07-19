const ForestApp = {
    components: [],

    data() {
        return {
            web3Modal: null,
            web3Provider: null,
            web3: null,
            mintContract: null,
            forestContract: null,
            shroomsContract: null,

            connected: false,
            loading: true,

            activeTab: 'unstaked',
            address: null,
            unstakedTokenIds: new Set(),
            unstakedSelectedTokenIds: new Set(),
            stakedTokenIds: new Set(),
            stakedTokenData: {},
            stakedSelectedTokenIds: new Set(),
            claimableTokenIds: new Set(),
            totalClaimableShrooms: 0,
            totalOwnedShrooms: 0,

            cachedTokenMetadata: JSON.parse(window.localStorage.getItem('cachedTokenMetadata')) || {}
        };
    },

    async created() {
        await this.initializeWeb3();

        if (window.localStorage.getItem('entered-forest') == 1) {
            await this.connectWallet();
        }

        setInterval(this.$forceUpdate, 1000);

        setInterval(async () => {
            if (this.loading) {
                return;
            }

            await this.updateUnstakedTokens();
            await this.updateStakedTokens();
            await this.updateShroomsBalance();
        }, 60000);
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
            this.forestContract = new this.web3.eth.Contract(ForestContract.abi, ForestContract.address);
            this.shroomsContract = new this.web3.eth.Contract(ShroomsContract.abi, ShroomsContract.address);

            let accounts = await this.web3.eth.requestAccounts();

            this.connected = true;
            this.address = accounts[0];

            window.localStorage.setItem('entered-forest', 1);

            await this.updateUnstakedTokens();
            await this.updateStakedTokens();
            await this.updateShroomsBalance();
        },

        async changeTab(tabName) {
            this.activeTab = tabName;

            this.unstakedSelectedTokenIds.clear();
            this.stakedSelectedTokenIds.clear();
        },

        async updateUnstakedTokens() {
            this.loading = true;

            try {
                let outgoingTransfers = await this.mintContract.getPastEvents('Transfer', {
                    filter: {
                        from: this.address
                    },
                    fromBlock: 0,
                    toBlock: 'latest'
                });

                let incomingTransfers = await this.mintContract.getPastEvents('Transfer', {
                    filter: {
                        to: this.address
                    },
                    fromBlock: 0,
                    toBlock: 'latest'
                });

                let allTransfers = outgoingTransfers.concat(incomingTransfers).sort((a, b) => {
                    return a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex;
                });

                let unstakedTokenIds = new Set();

                for (let transfer of allTransfers) {
                    if (transfer.returnValues.to === this.address) {
                        unstakedTokenIds.add(transfer.returnValues.tokenId);
                    } else if (transfer.returnValues.from === this.address) {
                        unstakedTokenIds.delete(transfer.returnValues.tokenId);
                    }
                }

                this.unstakedTokenIds = unstakedTokenIds;
            } catch (err) {
                alert(`Update failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async updateStakedTokens() {
            this.loading = true;

            try {
                let stakedTokenIds = new Set();
                let stakedTokenData = {};
                let claimableTokenIds = new Set();
                let totalClaimableShrooms = 0;

                let tokenIds = await this.forestContract.methods.getStakedTokenIdsOfUser(this.address).call();

                for (let tokenId of tokenIds) {
                    let tokenData = null;

                    if (tokenId < 10000) {
                        tokenData = await this.forestContract.methods.getWZRDStake(tokenId).call();

                        tokenData = {
                            tokenId: tokenId,
                            owner: tokenData[1],
                            start: parseInt(tokenData[2]),
                            locked: tokenData[3],
                            claimableShrooms: parseInt(this.web3.utils.fromWei(await this.forestContract.methods.getClaimableShrooms(tokenId).call()))
                        };

                        totalClaimableShrooms += tokenData.claimableShrooms;

                        claimableTokenIds.add(tokenId);
                    } else if (tokenId >= 10000) {
                        tokenData = await this.forestContract.methods.getEvilStake(tokenId).call();

                        tokenData = {
                            tokenId: tokenId,
                            owner: tokenData[1],
                            start: parseInt(tokenData[2]),
                            index: tokenData[3],
                            claimableShrooms: 0
                        };
                    }

                    stakedTokenIds.add(tokenId);
                    stakedTokenData[tokenId] = tokenData;
                }

                this.stakedTokenIds = stakedTokenIds;
                this.stakedTokenData = stakedTokenData;
                this.claimableTokenIds = claimableTokenIds;
                this.totalClaimableShrooms = totalClaimableShrooms;
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

        async stakeTokens() {
            this.loading = true;

            try {
                let transaction = await this.forestContract.methods.stakeWZRDS(Array.from(this.unstakedSelectedTokenIds)).send({
                    from: this.address
                });

                await this.updateUnstakedTokens();
                await this.updateStakedTokens();
                await this.updateShroomsBalance();

                for (let tokenCheckbox of document.querySelectorAll('.forest-token input[type=checkbox]')) {
                    tokenCheckbox.checked = false;
                }

                this.unstakedSelectedTokenIds.clear();
                this.stakedSelectedTokenIds.clear();

                this.$forceUpdate();
            } catch (err) {
                alert(`Staking failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async unstakeTokens() {
            this.loading = true;

            try {
                let transaction = await this.forestContract.methods.unstakeWZRDS(Array.from(this.stakedSelectedTokenIds)).send({
                    from: this.address
                });

                await this.updateUnstakedTokens();
                await this.updateStakedTokens();
                await this.updateShroomsBalance();

                for (let tokenCheckbox of document.querySelectorAll('.forest-token input[type=checkbox]')) {
                    tokenCheckbox.checked = false;
                }

                this.unstakedSelectedTokenIds.clear();
                this.stakedSelectedTokenIds.clear();

                this.$forceUpdate();
            } catch (err) {
                alert(`Unstaking failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async claimRewards() {
            this.loading = true;

            try {
                let transaction = await this.forestContract.methods.claimShrooms(Array.from(this.claimableTokenIds)).send({
                    from: this.address
                });

                await this.updateUnstakedTokens();
                await this.updateStakedTokens();
                await this.updateShroomsBalance();

                this.$forceUpdate();
            } catch (err) {
                alert(`Unstaking failed: ${err.message}`);
            } finally {
                this.loading = false;
            }
        },

        async onUnstakedTokensUpdated() {
            let selectedTokenIds = new Set();
            let selectedCheckboxes = document.querySelectorAll('.forest-tab-unstaked input[type=checkbox]:checked');

            for (let selectedCheckbox of selectedCheckboxes) {
                selectedTokenIds.add(parseInt(selectedCheckbox.getAttribute('data-token-id')));
            }

            this.unstakedSelectedTokenIds = selectedTokenIds;
        },

        async onStakedTokensUpdated() {
            let selectedTokenIds = new Set();
            let selectedCheckboxes = document.querySelectorAll('.forest-tab-staked input[type=checkbox]:checked');

            for (let selectedCheckbox of selectedCheckboxes) {
                selectedTokenIds.add(parseInt(selectedCheckbox.getAttribute('data-token-id')));
            }

            this.stakedSelectedTokenIds = selectedTokenIds;
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

        getTokenStakedData(tokenId) {
            return this.stakedTokenData[tokenId];
        },

        getTokenExploringFor(tokenId) {
            let tokenData = this.getTokenStakedData(tokenId);
            let secondsSince = (+new Date() / 1000) - tokenData.start;
            let exploreCap = 60 * 60 * 24 * 3;

            if (secondsSince > exploreCap) {
                secondsSince = exploreCap;
            }

            let days = Math.floor(secondsSince / (60 * 60 * 24));
            let hours = Math.floor(secondsSince % (60 * 60 * 24) / (60 * 60));
            let minutes = Math.floor(secondsSince % (60 * 60) / 60);
            let seconds = Math.floor(secondsSince % 60);

            if (secondsSince === exploreCap) {
                return `<strong class="is-max">Inventory Full</strong>`;
            } else if (days > 0) {
                return `${days}d ${hours}h ${minutes}m`;
            } else if (hours > 0) {
                return `${hours}h ${minutes}m ${seconds}s`;
            } else if (minutes > 0) {
                return `${minutes}m ${seconds}s`;
            }

            return `${seconds}s`;
        },

        async fetchTokenMetadata(tokenId) {
            let response = await axios.get(`/metadata/${tokenId}`);

            this.cachedTokenMetadata[tokenId] = response.data;

            window.localStorage.setItem('cachedTokenMetadata', JSON.stringify(this.cachedTokenMetadata));

            this.$forceUpdate();
        }
    }
};
